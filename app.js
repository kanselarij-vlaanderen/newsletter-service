import mu from 'mu';
import BelgaService from './repository/BelgaFTPService.js';
const app = mu.app;

import { prepareCampaign, sendCampaign, deleteCampaign } from './repository/MailchimpService';
import { ok } from 'assert';
const bodyParser = require('body-parser');

const dotenv = require('dotenv');

const repository = require('./repository/index.js');
const cors = require('cors');

dotenv.config();
app.use(bodyParser.json({ type: 'application/*+json' }));
app.use(cors());

const user = process.env.BELGA_FTP_USERNAME;
const password = process.env.BELGA_FTP_PASSWORD;
const host = 'ftp.belga.be';

const belgaConfig = {
  user,
  password,
  host
};
const service = new BelgaService(belgaConfig);

app.post('/createCampaign', (req, res) => {
  try {
    const agendaId = req.query.agendaId;
    if (!agendaId) {
      throw new Error('Mandatory parameter agendaId not found.');
    }
    const agendaInformationForNewsLetter = await getAgendaInformationForNewsletter(agendaId);
    const campaign = await prepareCampaign(agendaInformationForNewsLetter);
    res.send({
      status: ok,
      statusCode: 200,
      body: {
        campaign_id: campaign.campaignId,
        campaign_web_id: campaign.webId,
        archive_url: campaign.archiveUrl
      }
    });
  } catch (error) {
    console.log("A problem occured when prepairing a campaign in Mailchimp.");
    if (error.response) {
      console.log(`${error.status} ${error.response.body.title}: ${error.response.body.detail}`);
    } else {
      console.log(error);
    }
    res.status(500).send(error);
  }
});

app.get('/', (req, res) => {
  return repository.getMostRecentNewsletter(req, res);
});

app.post('/sendMailCampaign/:id', async (req, res, next) => {
  try {
    const campaignId = req.params.id;
    if (!campaignId ) {
      throw new Error('Request parameter id can not be null.');
    }

    const sendCampaignResult = await sendCampaign(campaignId);
    res.send({ sendCampaignResult });
  } catch (error) {
    console.log(`A problem occured when sending campaign ${campaignId} in Mailchimp.`);
    if (error.response) {
      console.log(`${error.status} ${error.response.body.title}: ${error.response.body.detail}`);
    } else {
      console.log(error);
    }
    next(error);
  }
});

app.post('/sendToBelga/:id', async (req, res, next) => {
  const agendaId = req.params.id;
  if (!agendaId) {
    throw new Error('No agenda id.');
  }
  try {
    console.time('SEND BELGA CAMPAIGN TIME');
    await service.generateXML(agendaId, true);
    console.timeEnd('SEND BELGA CAMPAIGN TIME');
    res.status(200).send({status: 200, title: 'Sending to Belga succeeded'});
  } catch (error) {
    next(error);
  }
});


app.get('/fetchTestMailCampaign/:id', async (req, res, next) => {
  try {
    const campaignId = req.params.id;
    if (!campaignId ) {
      throw new Error('Request parameter id can not be null.');
    }

    const campaignHtml = await getCampaignContent(campaignId);
    res.send({ body: campaignHtml.html });
  } catch (error) {
    console.log(`A problem occured when getting campaign content for campaign id ${campaignId} in Mailchimp.`);
    if (error.response) {
      console.log(`${error.status} ${error.response.body.title}: ${error.response.body.detail}`);
    } else {
      console.log(error);
    }
    next(error);
  }
});

app.get('/fetchTestMailCampaignMetaData/:id', async (req, res, next) => {
  try {
    const campaignId = req.params.id;
    if (!campaignId ) {
      throw new Error('Request parameter id can not be null.');
    }

    const campaignData = await getCampaignData(campaignId);
    res.send({ body: campaignData });
  } catch (error) {
    console.log(`A problem occured when getting campaign content for campaign id ${campaignId} in Mailchimp.`);
    if (error.response) {
      console.log(`${error.status} ${error.response.body.title}: ${error.response.body.detail}`);
    } else {
      console.log(error);
    }
    next(error);
  }

  const campaign_id = req.params.id;
  try {
    console.time('FETCH CAMPAIGN METADATA');
    const campaignHTML = await mailchimp.get({
      path: `/campaigns/${campaign_id}`
    });
    console.timeEnd('FETCH CAMPAIGN METADATA');
    res.send({ body: campaignHTML });
  } catch (error) {
    next(error);
  }
});

app.delete('/deleteMailCampaign/:id', async (req, res) => {
  try {
    const campaignId = req.params.id;
    if (!campaignId ) {
      throw new Error('Request parameter id can not be null.');
    }

    const deleteCampaignResult = await deleteCampaign(campaignId);
    // TODO check what deleted contains. According to mailchimp API, a succesfull delete contains an empty response
    res.send({ deleteCampaignResult });
  } catch (error) {
    console.log(`A problem occured when deleting campaign ${campaignId} in Mailchimp.`);
    if (error.response) {
      console.log(`${error.status} ${error.response.body.title}: ${error.response.body.detail}`);
    } else {
      console.log(error);
    }
    next(error);
  }
});

app.get('/xml-newsletter/:agenda_id', async (req, res) => {
  let agendaId = req.params.agenda_id;
  if (!agendaId) {
    throw new Error('No agenda_id provided.');
  }
  const generatedXMLPath = await service.generateXML(agendaId);
  res.download(generatedXMLPath); // Set disposition and send it.
});
