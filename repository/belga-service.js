import moment from 'moment';
import { createXMLConfig } from "../util/xml-renderer";
import { createNewsletterString } from "../util/newsletter-helper";
import { escapeHtml } from "../util/html";
import { getNewsletterByAgendaId, getAgendaInformationForNewsletter } from '../util/query-helper';
import ftpClient from 'ftp';
import fs from 'fs';
import xml from 'xml';
import { BELGA, AGENDA_ITEM_TYPES } from '../config';

export default class BelgaService {

  constructor() {
    this.connectionConfig = {
      user: BELGA.USER,
      password: BELGA.PASSWORD,
      host: BELGA.HOST
    };
  }

  async publishToBelga(filePath) {
    console.log("Publishing xml to Belga...");

    this.ftpClient = new ftpClient();

    await this.openConnection();
    await this.moveFileToFTP(filePath);
    await this.closeConnection();
    console.log("Publishing xml to Belga done.");

    return filePath;
  }

  openConnection() {
    console.log('OPEN Belga FTP connection');
    return new Promise((resolve, reject) => {
      try {
        this.ftpClient.on('ready', (err) => {
        if (err) return reject(new Error(`Error opening the ftp connection.`));
        console.log('Belga FTP connection opened.');
        resolve('connection opened');
        });
        this.ftpClient.on('error', (err) => {
          if (err) return reject(new Error(`Error opening the ftp connection.`));
        });
        this.ftpClient.connect(this.connectionConfig);
      } catch (error) {
        throw new Error('A problem occured opening the connection to Belga.');
      }
    });
  }

  closeConnection() {
    console.log('CLOSE Belga FTP connection');
    return new Promise((resolve, reject) => {
      this.ftpClient.on('end', (err) => {
        if (err) return reject(new Error(`Error closing the ftp connection.`));
        console.log('Belga FTP connection closed.');
        resolve();
      });
      this.ftpClient.end();
    })
    .catch((error) => {
      console.log(`A problem occured when closing the connection to Belga.`);
      return error;
    });;
  }

  moveFileToFTP(filePath) {
    console.log(`Moving file to FTP ${filePath.localPath}`);
    return new Promise((resolve, reject) => {
      this.ftpClient.put(filePath.localPath, filePath.name, (err) => {
        if (err) {
          return reject(new Error(`Error moving the file from directory.`));
        }
        resolve(filePath.name);
      });
    })
      .then((result) => {
        console.log(`XML has successfully been uploaded to Belga - ${result}`);
        return result;
      })
      .catch((error) => {
        console.log(`XML has not been uploaded to Belga - ${filePath.localPath}`);
        return error;
      });
  }

  async createBelgaNewsletterXML(meetingId) {
    console.log('Generating Belga XML ');
    const {
      procedureText,
      kindOfMeeting,
      formattedStart,
      meetingDate,
      agendaURI
    } = await getAgendaInformationForNewsletter(meetingId);

    const kindOfmeetingLowerCase = kindOfMeeting.toLowerCase().replace('vlaamse veerkracht', 'Vlaamse Veerkracht');
    const title = `Beslissingen van de ${kindOfmeetingLowerCase} van ${formattedStart}`;
    const data = await getNewsletterByAgendaId(agendaURI, AGENDA_ITEM_TYPES.NOTA);
    const announcementsData = await getNewsletterByAgendaId(agendaURI, AGENDA_ITEM_TYPES.MEDEDELING);

    const content = createNewsletterString(data, announcementsData);

    const sentAt = moment.tz('Europe/Brussels').format('YYYYMMDDTHHmmssZZ');

    const escapedContent = escapeHtml(`<![CDATA[ ${content} ]]>`);
    const identificationDate = moment(meetingDate).format('YYYYMMDD');
    const xmlConfig = createXMLConfig(escapedContent, sentAt, identificationDate, title);

    const xmlString = xml(xmlConfig, {declaration: true});
    const name = `Beslissingen_van_de_${kindOfmeetingLowerCase}_${procedureText || 'van'}_${formattedStart}.xml`
      .split(' ')
      .join('_');
    const path = `${BELGA.STORAGE_PATH}/${name}`;

    fs.writeFileSync(path, xmlString);

    console.log(`Generated xml file ${path}`);

    return { localPath: path, name: name };
  }

  // only used for automated testing
  listFTPServerDirectory() {
    console.log('Listing Belga FTP directory');
    return new Promise((resolve, reject) => {
      this.ftpClient.list((err, list) => {
        if (err) {
          return reject(new Error(`Error listing the file from directory.`));
        }
        resolve(list);
      });
    });
  }

  // only used for automated testing
  deleteFileFromServer(filePath) {
    console.log('Deleting file from Belga');
    return new Promise((resolve, reject) => {
      this.ftpClient.delete(filePath, (err) => {
        if (err) {
          return reject(new Error(`Error deleting the file from directory.`));
        }
        resolve(filePath);
      });
    });
  }
}
