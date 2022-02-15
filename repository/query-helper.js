import { query } from "express";
import helper from '../repository/helpers';
import moment from 'moment';
import 'moment-timezone';
const { getNewsItem } = require('../html-renderer/NewsItem');

export async function getAgendaInformationForNewsletter(graph, agendaId) {
  const agendaInformation = await getAgendaInformation(graph, agendaId);

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
    publication_date: agendaInformation.publication_date,
    agendaURI: agendaInformation.agenda,
    procedureText,
    kindOfMeeting,
    mailSubjectPrefix,
  };
}

export async function getNewsItemsHtml(agendaURI) {
  let newsletter = await getNewsletterByAgendaId(agendaURI);

  if (!newsletter || !newsletter[0]) {
    throw new Error('No newsletters present!');
  }

  const reducedNewsletters = helper.reduceNewslettersToMandateesByPriority(newsletter);
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

  return news_items_HTML;
}

async function getAgendaInformation(graph, agendaId) {
  const agendaInformation = await query(`
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
    PREFIX besluitvorming: <http://data.vlaanderen.be/ns/besluitvorming#>
    PREFIX dct: <http://purl.org/dc/terms/>

    SELECT DISTINCT ?agenda ?planned_start ?data_docs ?publication_date ?kind WHERE {
        GRAPH <${graph}> {
          ?agenda a besluitvorming:Agenda .
          ?agenda mu:uuid ${sparqlEscapeString(agendaId)} .
          ?agenda besluitvorming:isAgendaVoor ?meeting .
          ?meeting besluit:geplandeStart ?planned_start .
          OPTIONAL { ?meeting ext:algemeneNieuwsbrief ?newsletter . }
          OPTIONAL { ?meeting dct:type ?kind }
          OPTIONAL { ?newsletter ext:issuedDocDate ?data_docs . }
          OPTIONAL { ?newsletter dct:issued ?publication_date . }
          }
    }`);
  return parseSparqlResults(agendaInformation)[0];
};

async function getNewsletterByAgendaId(agendaUri) {
  const newsletterInformation = await query(`
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
        ${sparqlEscapeUri(agendaUri)} a besluitvorming:Agenda ;
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
    ORDER BY ASC(?mandateePriority)`);

  return parseSparqlResults(newsletterInformation)[0];
}

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