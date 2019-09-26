const ftpClient = require('ftp');
const fs = require('fs');
const xml = require('xml');
// const config = require('./config');
const repository = require('./index.js');
const xmlConfig = require('../xml-renderer/config.js');


const user = 'vlatest';
const password = 'alvalv';
const host = 'ftp.belga.be';
const port = 21; // this is the default port for FTP

let client;

export default class BelgaService {
  constructor() {
    // client = new ftpClient();
    // client.on('ready', function() {
    // 	client.list(function(err, list) {
    // 		if (err) throw err;
    // 		console.dir(list);
    // 		client.end();
    // 	});
    // });
    // this.connectToClient();
  }

  connectToClient() {
    const config = { host, port, password, user };

    // client.connect(config);
  }

  getRepository() {}

  checkDocumentExistence() {}

  uploadFile() {}

  deleteFile() {}

  normalizeId() {}

  formatDutchDate() {}

  deNormelizeId() {}

  async generateXML(agendaId) {
    const data = await repository.getNewsLetterByAgendaId(agendaId);
		const content = await createNewsletterString(data);

    const XMLCONFIG = xmlConfig.createXMLConfig(content);
    const xmlString = xml(XMLCONFIG, { declaration: true });
    const path = `${__dirname}/test.xml`;

    const output = fs.createWriteStream(path);
    output.write(xmlString);

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
}

const createNewsletterString = (data) => {
	let agendaitems = [];
	let announcements = [];

  data.map((newsletterItem) => {
		if (newsletterItem.remark) {
			announcements.push(
				`${newsletterItem.proposal || ''}${newsletterItem.title || ''} <br/> ${
					newsletterItem.richtext
				}`
			);
		} else {
			agendaitems.push(
				`${newsletterItem.proposal || ''}${newsletterItem.title || ''} <br/> ${
					newsletterItem.richtext || ''
				}`
			);
		}
	});
	return agendaitems.join('<br/>') + announcements.join('<br/>');
};
