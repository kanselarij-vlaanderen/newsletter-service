import mu from 'mu';
import BelgaService from  './repository/BelgaFTPService.js';

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

app.post('/createCampaign', (req, res) => {
  return mailchimpService.createCampaign(req, res);
});

app.get('/', (req, res) => {
  return repository.getMostRecentNewsletter(req, res);
});

app.post('/sendCampaign/:id', async (req, res) => {
  const campaign_id = req.params.id;
  const sendCampaign = await mailchimp.post({
    path: `/campaigns/${campaign_id}/actions/send`,
  });

  res.send({ sendCampaign });
});

app.delete('/deleteCampaign/:id', async (req, res) => {
  const campaign_id = req.params.id;
  if (!campaign_id) {
    throw new Error('Request parameter campaign_id can not be null');
  }
  const deleted = await mailchimpService.deleteCampaign(campaign_id);
  res.send({ deleted });
});


app.get('/xml-newsletter/:agenda_id', async(req, res) => {
  const service = new BelgaService();
  let agendaId = req.params.agenda_id;
  if(!agendaId) {
    throw new Error('No agenda_id provided.');
  }
  const generatedXMLPath = await service.generateXML(agendaId);
  res.download(generatedXMLPath); // Set disposition and send it.
});
