import mu from 'mu';
import BelgaService from './repository/BelgaFTPService.js';
const app = mu.app;
const Mailchimp = require('mailchimp-api-v3');
const mailchimp = new Mailchimp(process.env.MAILCHIMP_API || '');
const bodyParser = require('body-parser');
const mailchimpService = require('./repository/MailchimpService.js');
const repository = require('./repository/index.js');
const cors = require('cors');
const dotenv = require('dotenv');

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
  return mailchimpService.createCampaign(req, res);
});

app.get('/', (req, res) => {
  return repository.getMostRecentNewsletter(req, res);
});

app.post('/sendMailCampaign/:id', async (req, res, next) => {
  const campaign_id = req.params.id;
  if (!campaign_id ) {
    throw new Error('No campaign id.');
  }
  try {
    console.time('SEND MAILCHIMP CAMPAIGN TIME');
    const sendCampaign = await mailchimp.post({
      path: `/campaigns/${campaign_id}/actions/send`
    });
    console.time('SEND MAILCHIMP CAMPAIGN TIME');
    res.send({ sendCampaign });
  } catch (error) {
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
    console.time('SEND BELGA CAMPAIGN TIME');
    res.status(201).end();
  } catch (error) {
    next(error);
  }
});


app.get('/fetchTestMailCampaign/:id', async (req, res, next) => {
  const campaign_id = req.params.id;
  try {
    console.time('FETCH CAMPAIGN PREVIEW');
    const campaignHTML = await mailchimp.get({
      path: `/campaigns/${campaign_id}/content`
    });
    console.timeEnd('FETCH CAMPAIGN PREVIEW');
    res.send({ body: campaignHTML.html });
  } catch (error) {
    next(error);
  }
});

app.get('/fetchTestMailCampaignMetaData/:id', async (req, res, next) => {
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
  const campaign_id = req.params.id;
  if (!campaign_id) {
    throw new Error('Request parameter campaign_id can not be null');
  }
  const deleted = await mailchimpService.deleteCampaign(campaign_id);
  res.send({ deleted });
});

app.get('/xml-newsletter/:agenda_id', async (req, res) => {
  let agendaId = req.params.agenda_id;
  if (!agendaId) {
    throw new Error('No agenda_id provided.');
  }
  const generatedXMLPath = await service.generateXML(agendaId);
  res.download(generatedXMLPath); // Set disposition and send it.
});
