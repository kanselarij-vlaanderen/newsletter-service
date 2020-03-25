const ftpClient = require('ftp');
const fs = require('fs');
const xml = require('xml');
const xmlConfig = require('../xml-renderer/config.js');
const helper = require('../repository/helpers');
import moment from 'moment';

const client = new ftpClient();
let repository = null; // We need to do this to make it possible to test this service

let config = null;

export default class BelgaService {
  constructor(belgaConfig) {
    config = belgaConfig;
  }

  async generateXML(agendaId, transferToFtp = false) {
    repository = require('./index.js');
    console.time('FETCH BELGA INFORMATION TIME');
    const {
      procedureText,
      kindOfMeeting,
      formattedStart,
      publication_date,
      agendaURI
    } = await repository.getAgendaNewsletterInformation(agendaId);

    const kindOfmeetingLowerCase = kindOfMeeting.toLowerCase();
    const title = `Beslissingen van de ${kindOfmeetingLowerCase} van ${formattedStart}`;
    const data = await repository.getNewsLetterByAgendaId(agendaURI);
    const content = await createNewsletterString(data);

    console.timeEnd('FETCH BELGA INFORMATION TIME');
    const sentAt = moment
      .utc()
      .utcOffset('+02:00')
      .format('YYYYMMDDTHHmmssZZ');

    const escapedContent = escapeHtml(`<![CDATA[ ${content} ]]>`);
    const identicationDate = moment(publication_date).format('YYYYMMDD');
    const XMLCONFIG = xmlConfig.createXMLConfig(escapedContent, sentAt, identicationDate, title);

    const xmlString = xml(XMLCONFIG, { declaration: true });
    const name = `Beslissingen_van_de_${kindOfmeetingLowerCase}_${procedureText || 'van'}_${formattedStart}.xml`
      .split(' ')
      .join('_');
    const path = `${__dirname}/../generated-xmls/${name}`;

    const output = fs.createWriteStream(path);
    output.write(xmlString);
    if (transferToFtp) {
      this.openConnection();
      this.moveFileToFTP(path, name);
      this.closeConnection();
    }
    return new Promise((resolve, reject) => {
      output.on('open', function(fd) {
        console.log('file is open!');
        console.log('fd: ' + fd);
        resolve(path);
      });

      output.on('error', function(err) {
        reject(err);
      });
    });
  }

  listFTPServerDirectory() {
    console.time('LISTING BELGA-FTP DIRECTORY');
    return new Promise((resolve, reject) => {
      client.list((err, list) => {
        if (err) {
          return reject(new Error(`Error listing the file from directory.`));
        }
        console.timeEnd('LISTING BELGA-FTP DIRECTORY');
        resolve(list);
      });
    });
  }

  openConnection() {
    console.time('OPENING BELGA-FTP CONNECTION');
    return new Promise((resolve, reject) => {
      client.on('ready', (err) => {
        if (err) return reject(new Error(`Error opening the ftp connection.`));
        console.timeEnd('OPENING BELGA-FTP CONNECTION');
        resolve('connection opened');
      });
      client.connect(config);
    });
  }

  closeConnection() {
    console.time('CLOSING BELGA-FTP CONNECTION');
    return new Promise((resolve, reject) => {
      client.on('end', (err) => {
        if (err) return reject(new Error(`Error closing the ftp connection`));
        console.timeEnd('CLOSING BELGA-FTP CONNECTION');
        resolve();
      });
      client.end();
    });
  }

  moveFileToFTP(localPath, pathName) {
    return new Promise((resolve, reject) => {
      client.put(localPath, pathName, (err) => {
        if (err) {
          return reject(new Error(`Error moving the file from directory.`));
        }
        resolve(pathName);
      });
    })
      .then((result) => {
        console.log(`XML HAS SUCCESSFULLY BEEN UPLOADED TO BELGA - ${result}`);
        return result;
      })
      .catch((error) => {
        console.log(`XML HAS NOT BEEN UPLOADED TO BELGA - ${pathName}`);
        return error;
      });
  }

  deleteFileFromServer(filePath) {
    console.time('DELETING FILE FROM BELGA');
    return new Promise((resolve, reject) => {
      client.delete(filePath, (err, stream) => {
        if (err) {
          return reject(new Error(`Error deleting the file from directory.`));
        }
        console.timeEnd('DELETING FILE FROM BELGA');
        resolve(filePath);
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
      ${newsletterItem.title || ''}
      ${newsletterItem.proposalText || ''}
      ${newsletterItem.richtext || ''}
      </p>`
        .replace(/^\s+|\s+$/gm, '')
        .replace(/(?=<!--)([\s\S]*?)-->/gm, '')
        .replace(/\n&nbsp;*/gm, '')
        .trim()
    );
  });
  return agendaitems.join(``);
};

function escapeHtml(unsafe) {
  return unsafe.replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
