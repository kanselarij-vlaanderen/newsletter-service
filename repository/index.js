import mu from 'mu';
import { ok } from 'assert';
const targetGraph = 'http://mu.semte.ch/graphs/organizations/kanselarij';
import moment from 'moment';

moment.locale('nl');

const getAgendaWhereisMostRecentAndFinal = async () => {
  const query = `
        PREFIX dct: <http://purl.org/dc/terms/>
        PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
        PREFIX besluitvorming: <http://data.vlaanderen.be/ns/besluitvorming#>
        PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
        PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
        PREFIX dbpedia: <http://dbpedia.org/ontology/>
        PREFIX dct: <http://purl.org/dc/terms/>
        PREFIX prov: <http://www.w3.org/ns/prov#>
        PREFIX xsd: <http://mu.semte.ch/vocabularies/typed-literals/>
        
        SELECT DISTINCT ?uuid ?date ?agenda_uuid ?agenda_date WHERE {
            GRAPH <${targetGraph}> {
            ?meeting mu:uuid ?uuid; a besluit:Zitting .
            ?meeting ext:finaleZittingVersie "true"^^xsd:boolean .
            ?meeting besluit:geplandeStart ?date .
            ?agenda besluit:isAangemaaktVoor ?meeting .
            ?agenda ext:aangepastOp ?agenda_date .
            ?agenda mu:uuid ?agenda_uuid .
          }
        } ORDER BY DESC(?date) DESC(?agenda_date) LIMIT 1`;
  let data = await mu.query(query);
  return parseSparqlResults(data);
};

const getAgendaInformation = async (agendaId) => {
  const query = `
  PREFIX dct: <http://purl.org/dc/terms/>
        PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
        PREFIX besluitvorming: <http://data.vlaanderen.be/ns/besluitvorming#>
        PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
        PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
        PREFIX dbpedia: <http://dbpedia.org/ontology/>
        PREFIX dct: <http://purl.org/dc/terms/>
        PREFIX prov: <http://www.w3.org/ns/prov#>
        PREFIX xsd: <http://mu.semte.ch/vocabularies/typed-literals/>

        SELECT DISTINCT ?planned_start ?data_docs ?publication_date WHERE {
            GRAPH <${targetGraph}> {
              ?agenda a besluitvorming:Agenda .
              ?agenda mu:uuid "${agendaId}" .
              ?agenda besluit:isAangemaaktVoor ?meeting . 
              ?meeting besluit:geplandeStart ?planned_start .
              OPTIONAL { ?meeting ext:algemeneNieuwsbrief ?newsletter . }
              OPTIONAL { ?newsletter ext:issuedDocDate ?data_docs . }
              OPTIONAL { ?newsletter dct:issued ?publication_date . }
             }
        }`;
  let data = await mu.query(query);
  return parseSparqlResults(data);
};

const getAgendaNewsletterInformation = async (agendaId) => {
  let agendaInformation = await getAgendaInformation(agendaId);
  if (!agendaInformation || !agendaInformation[0]) {
    return {};
  }
  const { planned_start, publication_date, data_docs } = agendaInformation[0];

  const formattedStart = `${moment(
    new Date(planned_start).toLocaleString('nl', { timeZone: 'Europe/Berlin' })
  ).format('dddd DD-MM-YYYY HH:mm')}`;
  const formattedDocumentDate = moment(
    new Date(data_docs).toLocaleString('nl', { timeZone: 'Europe/Berlin' })
  ).format('dddd DD-MM-YYYY');
  const formattedPublicationDate = moment(
    new Date(publication_date).toLocaleString('nl', { timeZone: 'Europe/Berlin' })
  ).format('dddd DD-MM-YYYY');

  return { formattedStart, formattedDocumentDate, formattedPublicationDate };
};

const getNewsLetterByAgendaId = async (agendaId) => {
  const query = `
        PREFIX dct: <http://purl.org/dc/terms/>
        PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
        PREFIX besluitvorming: <http://data.vlaanderen.be/ns/besluitvorming#>
        PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
        PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
        PREFIX dbpedia: <http://dbpedia.org/ontology/>
        PREFIX dct: <http://purl.org/dc/terms/>
        PREFIX prov: <http://www.w3.org/ns/prov#>
        PREFIX xsd: <http://mu.semte.ch/vocabularies/typed-literals/>

        SELECT DISTINCT ?title ?richtext ?text ?subtitle ?remark ?proposal (GROUP_CONCAT(?label;separator=",") AS ?themes) WHERE {
            GRAPH <${targetGraph}> {
              ?agenda a besluitvorming:Agenda .
              ?agenda mu:uuid "${agendaId}" .
              ?agenda dct:hasPart ?agendaitem . 
              ?subcase besluitvorming:isGeagendeerdVia ?agendaitem .
              ?subcase prov:generated  ?newsletter . 
              ?agendaitem ext:wordtGetoondAlsMededeling ?remark .
              ?newsletter ext:inNieuwsbrief "true"^^xsd:boolean . 
              OPTIONAL { ?agendaitem ext:prioriteit ?priority . }
              OPTIONAL { ?newsletter besluitvorming:inhoud ?text . }
              OPTIONAL { ?newsletter ext:htmlInhoud ?richtext . }
              OPTIONAL { ?newsletter ext:voorstelVan ?proposal . }
              OPTIONAL { ?newsletter dbpedia:subtitle ?subtitle . }
              OPTIONAL { ?newsletter dct:title ?title . }
             }
            OPTIONAL { ?agendaitem ext:agendapuntSubject ?themeURI . 
                       ?themeURI   skos:prefLabel        ?label . }
        } GROUP BY ?title ?richtext ?text ?subtitle ?remark ?proposal ?priority
        ORDER BY ?priority`;
  let data = await mu.query(query);
  return parseSparqlResults(data);
};

const getMostRecentNewsletter = async (req, res) => {
  try {
    const response = await getAgendaWhereisMostRecentAndFinal();
    const { agenda_uuid } = response[0] || { agenda_uuid: null };

    if (!agenda_uuid) {
      res.send({ status: ok, statusCode: 404, message: 'Newsletter not found.' });
    } else {
      let newsletter = await getNewsLetterByAgendaId(agenda_uuid);
      if (!newsletter) {
        throw new Error('no newsletters present');
      }

      newsletter = newsletter.filter((newsletter_item) => {
        if (newsletter_item.finished) {
          let item = {};
          item.id = newsletter_item.uuid;
          item.webtitle = newsletter_item.title;
          item.description = newsletter_item.richtext;
          item.body = newsletter_item.text;
          item.publication_date = newsletter_item.created;
          item.modification_date = newsletter_item.modified;
          item.type = 'agenda_item';
          if (item.remark) {
            item.agenda_item_type = 'Opmerking';
          } else {
            item.agenda_item_type = 'Beslissing';
          }
          return item;
        }
      });

      res.send({
        total: newsletter.length,
        size: newsletter.length,
        items: newsletter,
      });
    }
  } catch (error) {
    console.error(error);
    res.send({ status: ok, statusCode: 500, body: { error } });
  }
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

module.exports = {
  getNewsLetterByAgendaId,
  getAgendaWhereisMostRecentAndFinal,
  getMostRecentNewsletter,
  getAgendaNewsletterInformation,
};
