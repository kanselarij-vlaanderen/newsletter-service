import {createXMLConfig} from "../util/xml-renderer";
import moment from 'moment';
import {createNewsletterString} from "../util/newsletter";
import {escapeHtml} from "../util/html";

const ftpClient = require('ftp');
const fs = require('fs');
const xml = require('xml');

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

        const kindOfmeetingLowerCase = kindOfMeeting.toLowerCase().replace('vlaamse veerkracht', 'Vlaamse Veerkracht');
        const title = `Beslissingen van de ${kindOfmeetingLowerCase} van ${formattedStart}`;
        const data = await repository.getNewsLetterByAgendaId(agendaURI);
        const content = createNewsletterString(data);

        console.timeEnd('FETCH BELGA INFORMATION TIME');
        const sentAt = moment
            .utc()
            .utcOffset('+02:00')
            .format('YYYYMMDDTHHmmssZZ');

        const escapedContent = escapeHtml(`<![CDATA[ ${content} ]]>`);
        const identicationDate = moment(publication_date).format('YYYYMMDD');
        const xmlConfig = createXMLConfig(escapedContent, sentAt, identicationDate, title);

        const xmlString = xml(xmlConfig, {declaration: true});
        const name = `Beslissingen_van_de_${kindOfmeetingLowerCase}_${procedureText || 'van'}_${formattedStart}.xml`
            .split(' ')
            .join('_');
        const path = `${__dirname}/../generated-xmls/${name}`;

        const output = fs.createWriteStream(path);
        output.write(xmlString);

        if (transferToFtp) {
            await this.openConnection();
            await this.moveFileToFTP(path, name);
            await this.closeConnection();
        } else {
            return new Promise((resolve, reject) => {
                output.on('open', function (fd) {
                    console.log('file is open!');
                    console.log('fd: ' + fd);
                    resolve(path);
                });

                output.on('error', function (err) {
                    reject(err);
                });
            });
        }

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
            client.delete(filePath, (err) => {
                if (err) {
                    return reject(new Error(`Error deleting the file from directory.`));
                }
                console.timeEnd('DELETING FILE FROM BELGA');
                resolve(filePath);
            });
        });
    }
}




