const ftpClient = require('ftp');
const fs = require('fs');
const xml = require('xml');
const repository = require('./index.js');
const xmlConfig = require('../xml-renderer/config.js');
const helper = require('../repository/helpers');
import moment from 'moment';

const user = process.env.BELGA_FTP_USERNAME;
const password = process.env.BELGA_FTP_PASSWORD;
const host = 'ftp.belga.be';

const config = {
  user,
  password,
  host
};

const client = new ftpClient();

export default class BelgaService {
  async generateXML(agendaId, transferToFtp = false) {
    console.time('FETCH BELGA INFORMATION TIME');
    const {
      procedureText,
      formattedStart,
      publication_date,
      agendaURI
    } = await repository.getAgendaNewsletterInformation(agendaId);

    const title = `Beslissingen van de ministerraad van ${formattedStart}`;
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
    const name = `Beslissingen_van_de_ministerraad_${procedureText || 'van'}_${formattedStart}.xml`
      .split(' ')
      .join('_');
    const path = `${__dirname}/../generated-xmls/${name}`;

    const output = fs.createWriteStream(path);
    output.write(xmlString);
    if(transferToFtp) {
      this.moveFileToFTP(path, name);
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

  listFTPDirectory() {
    console.time('LISTING BELGA-FTP DIRECTORY');
    return new Promise((resolve, reject) => {
      client.on('ready', () => {
        client.list((err, list) => {
          if (err) reject(err);
          console.dir(list);
          console.timeEnd('LISTING BELGA-FTP DIRECTORY');
          resolve(list);
          this.closeConnection();
        });
      });
      this.connectToFtp();
    });
  }

  connectToFtp() {
    console.time('OPENING BELGA-FTP CONNECTION');
    client.connect(config);
    console.timeEnd('OPENING BELGA-FTP CONNECTION');
  }

  closeConnection() {
    console.time('CLOSING BELGA-FTP CONNECTION');
    client.end();
    console.time('CLOSING BELGA-FTP CONNECTION');
  }

  moveFileToFTP(localPath, pathName) {
    return new Promise((resolve, reject) => {
      client.on('ready', () => {
        client.put(localPath, pathName, (err) => {
          if (err) throw err;
          resolve(err);
          this.closeConnection();
        });
      });
      this.connectToFtp();
    }).then((result) => {
      console.log(`XML HAS SUCCESSFULLY BEEN UPLOADED TO BELGA - ${pathName}`);
      return result;
    })
    .catch((error) => {
      console.log(`XML HAS NOT BEEN UPLOADED TO BELGA - ${pathName}`);
      return error;
    });
  }

  getFileFromDirectory(path = '2000000128634.xml') {
    console.time('FETCHING FILE FROM BELGA');
    return new Promise((resolve, reject) => {
      client.on('ready', () => {
        client.get(path, (err, stream) => {
          if (err) reject(err);
          stream.once('close', () => {
            this.closeConnection();
            resolve();
          });
          stream.pipe(fs.createWriteStream(`${__dirname}/../generated-xmls/testje.xml`));
          console.timeEnd('FETCHING FILE FROM BELGA');
          resolve();
        });
      });
      this.connectToFtp();
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
