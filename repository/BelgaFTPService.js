// const ftpClient = require('ftp');
const fs = require("fs");
const xml = require("xml");
const repository = require("./index.js");
const xmlConfig = require("../xml-renderer/config.js");
const helper = require("../repository/helpers");

import moment from "moment";

export default class BelgaService {
  async generateXML(agendaId) {
    console.time("FETCH BELGA INFORMATION TIME");
    const { formattedStart, publication_date, agendaURI } = await repository.getAgendaNewsletterInformation(agendaId);
    const data = await repository.getNewsLetterByAgendaId(agendaURI);
    const content = await createNewsletterString(data);
    console.timeEnd("FETCH BELGA INFORMATION TIME");
    const sentAt = moment
      .utc()
      .utcOffset("+02:00")
      .format("YYYYMMDDTHHmmssZZ");

    const escapedContent = escapeHtml(`<![CDATA[ Body content: ${content} ]]>`);

    const identicationDate = moment(publication_date).format("YYYYMMDD");
    const XMLCONFIG = xmlConfig.createXMLConfig(escapedContent, sentAt, identicationDate);
    const xmlString = xml(XMLCONFIG, { declaration: true });
    const path = `${__dirname}/../generated-xmls/Beslissingen_van_de_ministerraad_van_${formattedStart}.xml`;

    const output = fs.createWriteStream(path);
    output.write(xmlString);
    return new Promise((resolve, reject) => {
      output.on("open", function(fd) {
        console.log("file is open!");
        console.log("fd: " + fd);
        resolve(path);
      });

      output.on("error", function(err) {
        reject(err);
      });
    });
  }
}

/**
 * Returns a joined list of all items formatted in a readable string
 * @param {title: string, proposal: string, richtext:string} data -> list of items
 */
const createNewsletterString = (data) => {
  let agendaitems = [];
  const reducedNewsletters = helper.reduceNewslettersToMandateesByPriority(data);

  reducedNewsletters.map((newsletterItem) => {
    agendaitems.push(
      `<p>
      ${newsletterItem.title || ""}
      ${newsletterItem.proposalText || ""}
      ${newsletterItem.richtext || ""}
      </p>`
        .replace(/^\s+|\s+$/gm, "")
        .replace(/(?=<!--)([\s\S]*?)-->/gm, "")
        .replace(/\n&nbsp;*/gm, "")
        .trim()
    );
  });
  return agendaitems.join(``);
};

function escapeHtml(unsafe) {
  return unsafe.replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
