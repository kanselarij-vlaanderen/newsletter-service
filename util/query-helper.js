import moment from 'moment';
import 'moment-timezone';
import { getNewsItem } from './html';
import { reduceNewslettersToMandateesByPriority } from '../util/newsletter-helper';
import { sparqlEscapeString, sparqlEscapeUri, query } from 'mu';

moment.locale('nl');
moment.tz('Europe/Berlin').format('DD MMMM  YYYY');

const targetGraph = 'http://mu.semte.ch/graphs/organizations/kanselarij';
const electronicKindURI = 'http://themis.vlaanderen.be/id/concept/vergaderactiviteit-type/2387564a-0897-4a62-9b9a-d1755eece7af';
const specialKindURI = 'http://themis.vlaanderen.be/id/concept/vergaderactiviteit-type/62a0a3c3-44ed-4f35-8b46-1d50616ad42c';
const vlaamseVeerkrachtURI = 'http://themis.vlaanderen.be/id/concept/vergaderactiviteit-type/9b4701f8-a136-4009-94c6-d64fdc96b9a2';


/**
 *  Fetches all date information from an agenda.
 *  @param meetingId:string
 *  @returns an object: {
 *  formattedStart,           --> Formatted start date of a meeting | DD MMMM  YYYY
 *  formattedDocumentDate,    --> Formatted document release date   | DD MMMM YYYY [om] HH:mm
 *  formattedPublicationDate, --> Formatted publication date        | MMMM Do YYYY
 *  publication_date          --> non-formatted (raw) publication date
 *  agendaURI                 --> URI of the agenda (use this instead of id to speed up queries)
 *  procedureText             --> Text that should be added to the title of the newsletter
 *  kindOfMeeting             --> The kind of meeting to display in the title of the newsletter
 *  }
 */
export async function getAgendaInformationForNewsletter(meetingId) {
  const meetingURI = await getMeetingURI(meetingId);
  const latestAgendaURI = await getLastestAgenda(meetingURI)

  const agendaInformation = await getAgendaInformation(latestAgendaURI);
  if (!agendaInformation || !agendaInformation[0]) {
    throw new Error('No agenda Information was found');
  }

  const {planned_start, publication_date, data_docs, kind} = agendaInformation[0];
  if (!data_docs) {
    throw new Error('This agenda has no Nota Documents');
  }

  const formattedStart = moment(planned_start).tz('Europe/Berlin').format('DD MMMM YYYY');
  const formattedDocumentDate = moment(data_docs).tz('Europe/Berlin').format('DD MMMM YYYY [om] HH:mm');
  const formattedPublicationDate = moment(publication_date).tz('Europe/Berlin').format('MMMM Do YYYY');

  let procedureText = '';
  let kindOfMeeting = 'Ministerraad';
  let mailSubjectPrefix = 'Ministerraad';

  if (kind === electronicKindURI) {
    procedureText = 'via elektronische procedure ';
    mailSubjectPrefix = `Ministerraad via elektronische procedure`;
    console.log('[PROCEDURE TEXT]:', procedureText);
  }
  if (kind === specialKindURI) {
    kindOfMeeting = 'Bijzondere ministerraad'; // should this be capitalized M ?
    mailSubjectPrefix = `Bijzondere Ministerraad`;
  }
  if (kind === vlaamseVeerkrachtURI) {
    kindOfMeeting = 'Ministerraad - Plan Vlaamse Veerkracht';
    mailSubjectPrefix = `Ministerraad Vlaamse Veerkracht`;
  }

  return {
    formattedStart,
    formattedDocumentDate,
    formattedPublicationDate,
    publication_date: publication_date,
    agendaURI: latestAgendaURI,
    procedureText,
    kindOfMeeting,
    mailSubjectPrefix,
  };
}

export async function getNewsItemInfo(agendaURI) {
  let newsletter = await getNewsletterByAgendaId(agendaURI);

  if (!newsletter || !newsletter[0]) {
    throw new Error('No newsletters present!');
  }

  const reducedNewsletters = reduceNewslettersToMandateesByPriority(newsletter);

  let allThemesOfNewsletter = [];
  const news_items_HTML = reducedNewsletters.map((item) => {
    let segmentConstraint = {begin: '', end: ''};
    if (item && item.themes) {
      let uniqueThemes = [...new Set(item.themes.split(','))];
      allThemesOfNewsletter.push(...uniqueThemes);

      segmentConstraint = {
        begin: createBeginSegment(uniqueThemes.join(',')),
        end: createEndSegment()
      };
    }
    console.log('PRIORITY:', item.groupPriority);
    return getNewsItem(item, segmentConstraint);
  });

  return { htmlContent: news_items_HTML, newsletterThemes: allThemesOfNewsletter } ;
}

export async function getNewsletterByAgendaId(agendaUri) {
  const newsletterInformation = await query(`
    PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
    PREFIX besluitvorming: <http://data.vlaanderen.be/ns/besluitvorming#>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX prov: <http://www.w3.org/ns/prov#>
    PREFIX xsd: <http://mu.semte.ch/vocabularies/typed-literals/>
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX schema: <http://schema.org/>

    SELECT ?title ?richtext (GROUP_CONCAT(?label;separator=",") AS ?themes) ?mandateeTitle ?mandateePriority ?newsletter ?mandateeName ?agendaitemPrio
    WHERE {
      GRAPH ${sparqlEscapeUri(targetGraph)} {
        ${sparqlEscapeUri(agendaUri)} a besluitvorming:Agenda ;
          dct:hasPart ?agendaitem .
        ?agendaitem a besluit:Agendapunt ;
          ext:wordtGetoondAlsMededeling "false"^^xsd:boolean ;
          schema:position ?agendaitemPrio .
        ?treatment a besluit:BehandelingVanAgendapunt ;
          besluitvorming:heeftOnderwerp ?agendaitem ;
          prov:generated ?newsletter .
        ?newsletter a besluitvorming:NieuwsbriefInfo ;
          ext:inNieuwsbrief "true"^^xsd:boolean .
        OPTIONAL {
          ?agendaitem ext:heeftBevoegdeVoorAgendapunt ?mandatee .
          ?mandatee dct:title ?mandateeTitle .
          ?mandatee mandaat:rangorde ?mandateePriority .
          ?mandatee ext:nieuwsbriefTitel ?mandateeName .
        }
        OPTIONAL { ?newsletter ext:htmlInhoud ?richtext . }
        OPTIONAL { ?newsletter dct:title ?title . }
      }
      OPTIONAL {
        ?newsletter dct:subject ?themeURI .
        ?themeURI ext:mailchimpId ?label .
      }
    }
    GROUP BY ?title ?richtext ?mandateeTitle ?mandateePriority ?newsletter ?mandateeName ?agendaitemPrio
    ORDER BY ASC(?mandateePriority)`);

  return parseSparqlResults(newsletterInformation);
}

async function getMeetingURI (meetingId) {
  console.log(`Get meetingURI for meeting ${meetingId}`);
  const meetingUriQuery = await query(`
  PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  SELECT DISTINCT ?meeting WHERE {
    GRAPH <${targetGraph}> {
      ?meeting a besluit:Vergaderactiviteit ;
        mu:uuid ${sparqlEscapeString(meetingId)} .
    }
  }`);

  if (meetingUriQuery.results.bindings.length) {
    return meetingUriQuery.results.bindings[0].meeting.value;
  }

  throw new Error(`Meeting with id ${meetingId} not found`);

};
/**
 * Gets the latest agenda from the given meeting, regardless of the agenda status
 *
 * @param {uri} meetingURI
 * @returns {*} agendaURI
 */
async function getLastestAgenda (meetingURI) {
  console.log(`Get latest agenda for meetingURI ${meetingURI}`);
  const latestAgendaQuery = await query(`
    PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
    PREFIX besluitvorming: <http://data.vlaanderen.be/ns/besluitvorming#>
    SELECT DISTINCT ?agenda
    WHERE {
      GRAPH <${targetGraph}> {
        ${sparqlEscapeUri(meetingURI)} a besluit:Vergaderactiviteit .
        ?agenda besluitvorming:isAgendaVoor ${sparqlEscapeUri(meetingURI)} ;
          a besluitvorming:Agenda ;
          besluitvorming:volgnummer ?serialnumber .
      }
    } ORDER BY DESC(?serialnumber) LIMIT 1`);

  if (latestAgendaQuery.results.bindings.length) {
    return latestAgendaQuery.results.bindings[0].agenda.value;
  }
  // should be unreachable, a meeting without agendas shouldn't exist
  throw new Error(`No agendas found for meeting ${meetingURI}`);
}

async function getAgendaInformation(latestAgendaURI) {
  console.log(`Get agenda information for agendaURI ${latestAgendaURI}`);

  // TODO KAS-3431 themis or ext:issuedDocDate?
  // Both are valid and should be equal at all times, but could there be multiple themis-publications with different dates?
  // normally at the time of this newsletter release, there should only be 1 with documents in scope
  // newsletter is normally not "released again" should there be a withdrawal of a themis publication
  // At that point in time, the mails have been sent so any incorrect info in newsletters is already "public" anyway
  const agendaInformation = await query(`
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
    PREFIX besluitvorming: <http://data.vlaanderen.be/ns/besluitvorming#>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX prov: <http://www.w3.org/ns/prov#>
    PREFIX generiek:  <https://data.vlaanderen.be/ns/generiek#>

    SELECT DISTINCT ?planned_start ?data_docs ?publication_date ?kind WHERE {
      GRAPH <${targetGraph}> {
        ${sparqlEscapeUri(latestAgendaURI)} a besluitvorming:Agenda ;
          besluitvorming:isAgendaVoor ?meeting .
        ?meeting besluit:geplandeStart ?planned_start .
        OPTIONAL { ?meeting dct:type ?kind . }
        OPTIONAL { ?meeting ext:algemeneNieuwsbrief ?newsletter . }
        OPTIONAL { ?newsletter dct:issued ?publication_date . }
        OPTIONAL {
          ?themisPublicationActivity a ext:ThemisPublicationActivity ;
            prov:used ?meeting ;
            ext:scope 'documents' ;
            generiek:geplandeStart ?data_docs . 
        }
      }
    }`);

  return parseSparqlResults(agendaInformation);
};

const parseSparqlResults = (data) => {
  const vars = data.head.vars;
  return data.results.bindings.map((binding) => {
    let obj = {};

    vars.forEach((varKey) => {
      if (binding[varKey]) {
        obj[varKey] = binding[varKey].value;
      } else {
        obj[varKey] = null;
      }
    });
    return obj;
  });
};

/** This function creates the beginning of a merge-tag-block.
 * https://mailchimp.com/help/use-conditional-merge-tag-blocks/#Use_Groups_with_Conditional_Merge_Tag_Blocks
 */
 const createBeginSegment = (themesString, segmentPrefix = "Thema's") => {
  return `*|INTERESTED:${segmentPrefix}:${themesString}|*`;
};

const createEndSegment = () => {
  return `*|END:INTERESTED|*`;
};
