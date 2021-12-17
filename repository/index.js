import { query, sparqlEscapeUri, sparqlEscapeString } from 'mu';
import moment from 'moment';
import 'moment-timezone';
import {parseSparqlResults} from "../util";

moment.locale('nl');
moment.tz('Europe/Berlin').format('DD MMMM  YYYY');

const targetGraph = 'http://mu.semte.ch/graphs/organizations/kanselarij';
const electronicKindURI =
  'http://kanselarij.vo.data.gift/id/concept/ministerraad-type-codes/406F2ECA-524D-47DC-B889-651893135456';
const specialKindURI =
  'http://kanselarij.vo.data.gift/id/concept/ministerraad-type-codes/7D8E35BE-E5D1-494F-B5F9-51B07875B96F';
const vlaamseVeerkrachtURI =
  'http://kanselarij.vo.data.gift/id/concept/ministerraad-type-codes/1d16cb70-0ae9-489e-bf97-c74897222e3c';


const getMeetingURI = async (meetingId) => {
  console.time('QUERY TIME MEETING INFORMATION');
  const queryString = `
  PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  SELECT DISTINCT ?meeting WHERE {
    ?meeting a besluit:Vergaderactiviteit ;
      mu:uuid ${sparqlEscapeString(meetingId)} .
  }`;

  const data = await query(queryString).catch(err => {
    console.error(err);
  });
  console.timeEnd('QUERY TIME MEETING INFORMATION');
  if (data.results.bindings.length) {
    return data.results.bindings[0].meeting.value;
  }
  throw new Error(`Meeting with id ${meetingId} not found`);

};
/**
 * Gets the latest agenda from the given meeting, regardless of the agenda status
 *
 * @param {uri} meetingURI
 * @returns {*} agendaURI
 */
const getLastestAgenda = async (meetingURI) => {
  console.time('QUERY TIME LATEST AGENDA INFORMATION');
  const queryString = `
  PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
  PREFIX besluitvorming: <http://data.vlaanderen.be/ns/besluitvorming#>
  SELECT DISTINCT ?agenda
  WHERE {
    ${sparqlEscapeUri(meetingURI)} a besluit:Vergaderactiviteit .
    ?agenda besluitvorming:isAgendaVoor ${sparqlEscapeUri(meetingURI)} ;
      a besluitvorming:Agenda ;
      besluitvorming:volgnummer ?serialnumber .
  } ORDER BY DESC(?serialnumber) LIMIT 1
  `;

  const result = await query(queryString);
  console.timeEnd('QUERY TIME LATEST AGENDA INFORMATION');
  if (result.results.bindings.length) {
    return result.results.bindings[0].agenda.value;
  }
  // should be unreachable, a meeting without agendas shouldn't exist
  throw new Error(`No agendas found for meeting ${meetingURI}`);
}

const getAgendaInformationQuery = async (latestAgendaURI) => {
  console.time('QUERY TIME AGENDA INFORMATION');
  const queryString = `
        PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
        PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
        PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
        PREFIX besluitvorming: <http://data.vlaanderen.be/ns/besluitvorming#>
        PREFIX dct: <http://purl.org/dc/terms/>

        SELECT DISTINCT ?planned_start ?data_docs ?publication_date ?kind WHERE {
            GRAPH <${targetGraph}> {
              ${sparqlEscapeString(latestAgendaURI)} a besluitvorming:Agenda .
              ${sparqlEscapeString(latestAgendaURI)} besluitvorming:isAgendaVoor ?meeting . 
              ?meeting besluit:geplandeStart ?planned_start .
              OPTIONAL { ?meeting ext:algemeneNieuwsbrief ?newsletter . }
              OPTIONAL { ?meeting dct:type ?kind }
              OPTIONAL { ?newsletter ext:issuedDocDate ?data_docs . }
              OPTIONAL { ?newsletter dct:issued ?publication_date . }
             }
        }`;
  const data = await query(queryString);
  console.timeEnd('QUERY TIME AGENDA INFORMATION');
  return parseSparqlResults(data);
};

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
const getAgendaNewsletterInformation = async (meetingId) => {
  if (!meetingId) {
    throw new Error('No meeting provided.');
  }
  const meetingURI = await getMeetingURI(meetingId);
  const latestAgendaURI = await getLastestAgenda(meetingURI)

  let agendaInformation = await getAgendaInformationQuery(latestAgendaURI);
  if (!agendaInformation || !agendaInformation[0]) {
    throw new Error('No agenda Information was found');
  }
  const {planned_start, publication_date, data_docs, agenda, kind} = agendaInformation[0];
  if (!data_docs) {
    throw new Error('This agenda has no Nota Documents');
  }
  const formattedStart = moment(planned_start)
    .tz('Europe/Berlin')
    .format('DD MMMM YYYY');
  const formattedDocumentDate = moment(data_docs)
    .tz('Europe/Berlin')
    .format('DD MMMM YYYY [om] HH:mm');
  const formattedPublicationDate = moment(publication_date)
    .tz('Europe/Berlin')
    .format('MMMM Do YYYY');

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
  console.log('[KIND OF MEETING TEXT]:', kindOfMeeting);
  console.log('[mailSubjectPrefix TEXT]:', mailSubjectPrefix);
  console.log('FETCHED DATA FROM AGENDA WITH URI: ', latestAgendaURI);
  return {
    formattedStart,
    formattedDocumentDate,
    formattedPublicationDate,
    publication_date,
    agendaURI: latestAgendaURI,
    procedureText,
    kindOfMeeting,
    mailSubjectPrefix,
  };
};

const getNewsLetterByAgendaId = async (agendaURI) => {
  console.time('QUERY TIME NEWSLETTER INFORMATION');
  const queryString = `
    PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
    PREFIX besluitvorming: <http://data.vlaanderen.be/ns/besluitvorming#>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX prov: <http://www.w3.org/ns/prov#>
    PREFIX xsd: <http://mu.semte.ch/vocabularies/typed-literals/>
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>

    SELECT ?title ?richtext (GROUP_CONCAT(?label;separator=",") AS ?themes) ?mandateeTitle ?mandateePriority ?newsletter ?mandateeName ?agendaitemPrio
    WHERE {
      GRAPH ${sparqlEscapeUri(targetGraph)} {
        ${sparqlEscapeUri(agendaURI)} a besluitvorming:Agenda ;
          dct:hasPart ?agendaitem . 
        ?agendaitem a besluit:Agendapunt ;
          ext:wordtGetoondAlsMededeling "false"^^xsd:boolean ;
          ext:prioriteit ?agendaitemPrio .
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
    ORDER BY ASC(?mandateePriority)`;
  const data = await query(queryString);
  console.timeEnd('QUERY TIME NEWSLETTER INFORMATION');
  return parseSparqlResults(data);
};

export {getNewsLetterByAgendaId, getAgendaNewsletterInformation};

