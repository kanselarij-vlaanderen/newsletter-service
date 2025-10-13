import moment from 'moment';
import 'moment-timezone';
import { getNewsItem, getAnnouncementHeader } from './html';
import { reduceNewslettersToMandateesByPriority } from '../util/newsletter-helper';
import {
  sparqlEscapeString,
  sparqlEscapeUri,
  sparqlEscapeDateTime,
  query,
  update,
  uuid,
} from 'mu';
import { AGENDA_ITEM_TYPES, MEETING_KIND_TYPES } from '../config';

moment.locale('nl');
moment.tz('Europe/Berlin').format('DD MMMM  YYYY');

/**
 *  Fetches all date information from an agenda.
 *  @param meetingId:string
 *  @returns an object: {
 *  formattedStart,           --> Formatted start date of a meeting | DD MMMM  YYYY
 *  formattedDocumentDate,    --> Formatted document release date   | DD MMMM YYYY [om] HH:mm
 *  meetingDate               --> non-formatted (raw) planned start date of the meeting
 *  agendaURI                 --> URI of the agenda (use this instead of id to speed up queries)
 *  procedureText             --> Text that should be added to the title of the newsletter
 *  kindOfMeeting             --> The kind of meeting to display in the title of the newsletter
 *  }
 */
export async function getAgendaInformationForNewsletter(meetingId) {
  const meetingURI = await getMeetingURI(meetingId);
  const latestAgendaURI = await getLastestAgenda(meetingURI);

  const agendaInformation = await getAgendaInformation(latestAgendaURI);
  if (!agendaInformation || !agendaInformation[0]) {
    throw new Error('No agenda Information was found');
  }

  const {meetingDate, documentPublicationDate, kind} = agendaInformation[0];
  if (!documentPublicationDate) {
    throw new Error('This agenda has no Nota Documents');
  }

  const formattedStart = moment(meetingDate).tz('Europe/Berlin').format('DD MMMM YYYY');
  const formattedDocumentDate = moment(documentPublicationDate).tz('Europe/Berlin').format('DD MMMM YYYY [om] HH:mm');

  let procedureText = '';
  let kindOfMeeting = 'Ministerraad';
  let mailSubjectPrefix = 'Ministerraad';

  if (kind === MEETING_KIND_TYPES.EP) {
    procedureText = 'via elektronische procedure ';
    mailSubjectPrefix = `Ministerraad via elektronische procedure`;
    console.log('[PROCEDURE TEXT]:', procedureText);
  }
  if (kind === MEETING_KIND_TYPES.BM) {
    kindOfMeeting = 'Bijzondere ministerraad'; // should this be capitalized M ?
    mailSubjectPrefix = `Bijzondere Ministerraad`;
  }
  if (kind === MEETING_KIND_TYPES.PVV) {
    kindOfMeeting = 'Ministerraad - Plan Vlaamse Veerkracht';
    mailSubjectPrefix = `Ministerraad Vlaamse Veerkracht`;
  }

  return {
    meetingURI,
    formattedStart,
    formattedDocumentDate,
    meetingDate: meetingDate,
    agendaURI: latestAgendaURI,
    procedureText,
    kindOfMeeting,
    mailSubjectPrefix,
  };
}

export async function getNewsItemInfo(agendaURI) {
  const newsletter = await getNewsletterByAgendaId(agendaURI, AGENDA_ITEM_TYPES.NOTA);
  const announcementsData = await getNewsletterByAgendaId(agendaURI, AGENDA_ITEM_TYPES.MEDEDELING);

  // TODO this could have side effects like accidental sending of only announcements if no "in kort bestek" was selected for notas
  if (!newsletter || !newsletter[0]) {
    if (!announcementsData || !announcementsData[0]) {
      throw new Error('No newsletters present!');
    }
    // only announcements found, do something?
  }

  
  let allThemesOfNewsletter = [];
  let news_items_HTML = [];
  if (newsletter && newsletter[0]) {
    const reducedNewsletters = reduceNewslettersToMandateesByPriority(newsletter);
    // This could be optional when only an announcements needs to be published
    news_items_HTML = reducedNewsletters.map((item) => {
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
  }

  if (announcementsData && announcementsData[0]) {
    const reducedAnnouncements = reduceNewslettersToMandateesByPriority(announcementsData, true);
    const announcementHeader = getAnnouncementHeader();
    const announcement_news_items_HTML = reducedAnnouncements.map((item) => {
      let segmentConstraint = {begin: '', end: ''};
      if (item && item.themes) {
        let uniqueThemes = [...new Set(item.themes.split(','))];
        allThemesOfNewsletter.push(...uniqueThemes);
  
        segmentConstraint = {
          begin: createBeginSegment(uniqueThemes.join(',')),
          end: createEndSegment()
        };
      }
      console.log('PRIORITY:', item.groupPriority, 'POSITION', item.agendaitemPrio);
      return getNewsItem(item, segmentConstraint);
    });
    
    news_items_HTML = [...news_items_HTML, announcementHeader, ...announcement_news_items_HTML];
  }

  return { htmlContent: news_items_HTML, newsletterThemes: allThemesOfNewsletter } ;
}

export async function getNewsletterByAgendaId(agendaUri, agendaitemType) {
  const newsletterInformation = await query(`
    PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
    PREFIX besluitvorming: <https://data.vlaanderen.be/ns/besluitvorming#>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX prov: <http://www.w3.org/ns/prov#>
    PREFIX tl: <http://mu.semte.ch/vocabularies/typed-literals/>
    PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
    PREFIX schema: <http://schema.org/>
    PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>

    SELECT ?title ?richtext (GROUP_CONCAT(?label;separator=",") AS ?themes) ?mandateeTitle ?mandateePriority ?newsletter ?mandateeName ?agendaitemPrio
    # FROM kanselarij
    # FROM public
    WHERE {
      ${sparqlEscapeUri(agendaUri)} a besluitvorming:Agenda ;
        dct:hasPart ?agendaitem .
      ?agendaitem a besluit:Agendapunt ;
        dct:type ${sparqlEscapeUri(agendaitemType)} ;
        schema:position ?agendaitemPrio .
      ?treatment a besluit:BehandelingVanAgendapunt ;
        dct:subject ?agendaitem .
      ?newsletter a ext:Nieuwsbericht ;
        prov:wasDerivedFrom ?treatment ;
        ext:inNieuwsbrief "true"^^tl:boolean .
      OPTIONAL {
        ?agendaitem ext:heeftBevoegdeVoorAgendapunt ?mandatee .
        ?mandatee dct:title ?mandateeTitle .
        ?mandatee mandaat:rangorde ?mandateePriority .
        ?mandatee ext:nieuwsbriefTitel ?mandateeName .
      }
      OPTIONAL { ?newsletter nie:htmlContent ?richtext . }
      OPTIONAL { ?newsletter dct:title ?title . }
      OPTIONAL {
        ?newsletter dct:subject ?themeURI .
        ?themeURI ext:mailchimpId ?label .
      }
    }
    GROUP BY ?title ?richtext ?mandateeTitle ?mandateePriority ?newsletter ?mandateeName ?agendaitemPrio
    ORDER BY ASC(?mandateePriority)`);

  return parseSparqlResults(newsletterInformation);
}

export async function createMailCampaign(meetingUri, mailCampaign) {
  const {
    campaignId,
    web_id: webId,
    archive_url: archiveUrl,
  } = mailCampaign;
  const id = uuid();

  console.log(`Create mail campaign with id ${id} for meetingUri ${meetingUri}`);

  const mailCampaignUri = `http://themis.vlaanderen.be/id/mailcampagne/${id}`;

  await update(`
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

    INSERT DATA {
      ${sparqlEscapeUri(meetingUri)} ext:heeftMailCampagnes ${sparqlEscapeUri(mailCampaignUri)} .
      ${sparqlEscapeUri(mailCampaignUri)} a ext:MailCampagne ;
        mu:uuid ${sparqlEscapeString(id)} ;
        ext:campagneId ${sparqlEscapeString(campaignId)} ;
        ext:campagneWebId ${sparqlEscapeString(String(webId))} ;
        ext:voorbeeldUrl ${sparqlEscapeString(archiveUrl)} .
    }`);
  return id;
}

export async function updateMailCampaignSentTime(mailCampaignId, sentTime) {
  console.log(`Updating mail campaign sent time with id ${mailCampaignId}`);

  return await update(`
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

    INSERT { ?mailCampaign ext:isVerstuurdOp ${sparqlEscapeDateTime(sentTime)} }
    WHERE {
      ?mailCampaign a ext:MailCampagne ;
        ext:campagneId ${sparqlEscapeString(mailCampaignId)} .
    }`);
}

export async function deleteMailCampaign(mailCampaignId) {
  console.log(`Deleting mail campaign with id ${mailCampaignId}`);

  return await update(`
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

    DELETE WHERE {
      ?mailCampaign a ext:MailCampagne ;
        ext:campagneId ${sparqlEscapeString(mailCampaignId)} ;
        ?p ?o .
      ?s ?pp ?mailCampaign .
    }`);
}

async function getMeetingURI (meetingId) {
  console.log(`Get meetingURI for meeting ${meetingId}`);
  const meetingUriQuery = await query(`
  PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
  PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
  SELECT DISTINCT ?meeting WHERE {
    ?meeting a besluit:Vergaderactiviteit ;
      mu:uuid ${sparqlEscapeString(meetingId)} .
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
    PREFIX besluitvorming: <https://data.vlaanderen.be/ns/besluitvorming#>
    SELECT DISTINCT ?agenda
    WHERE {
      ${sparqlEscapeUri(meetingURI)} a besluit:Vergaderactiviteit .
      ?agenda besluitvorming:isAgendaVoor ${sparqlEscapeUri(meetingURI)} ;
        a besluitvorming:Agenda ;
        besluitvorming:volgnummer ?serialnumber .
    } ORDER BY DESC(?serialnumber) LIMIT 1`);

  if (latestAgendaQuery.results.bindings.length) {
    return latestAgendaQuery.results.bindings[0].agenda.value;
  }
  // should be unreachable, a meeting without agendas shouldn't exist
  throw new Error(`No agendas found for meeting ${meetingURI}`);
}

async function getAgendaInformation(latestAgendaURI) {
  console.log(`Get agenda information for agendaURI ${latestAgendaURI}`);

  const agendaInformation = await query(`
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
    PREFIX besluitvorming: <https://data.vlaanderen.be/ns/besluitvorming#>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX prov: <http://www.w3.org/ns/prov#>
    PREFIX generiek:  <https://data.vlaanderen.be/ns/generiek#>

    SELECT DISTINCT ?meetingDate ?documentPublicationDate ?kind WHERE {
      ${sparqlEscapeUri(latestAgendaURI)} a besluitvorming:Agenda ;
        besluitvorming:isAgendaVoor ?meeting .
      ?meeting besluit:geplandeStart ?meetingDate .
      OPTIONAL { ?meeting dct:type ?kind . }
      OPTIONAL {
        ?themisPublicationActivity a ext:ThemisPublicationActivity ;
          prov:used ?meeting ;
          ext:scope 'documents' ;
          generiek:geplandeStart ?documentPublicationDate .
      }
    } ORDER BY ?documentPublicationDate ?meetingDate LIMIT 1`);

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
