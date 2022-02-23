import { app } from 'mu';
import { getAgendaInformationForNewsletter } from './util/query-helper';
import BelgaService from './repository/belga-service';
import MailchimpService from './repository/mailchimp-service';

const user = process.env.BELGA_FTP_USERNAME;
const password = process.env.BELGA_FTP_PASSWORD;
const host = process.env.BELGA_FTP_HOST;

const requiredEnvironmentVariables = [
  'MAILCHIMP_API',
  'MAILCHIMP_FROM_NAME',
  'MAILCHIMP_REPLY_TO',
  'MAILCHIMP_LIST_ID',
  'MAILCHIMP_INTEREST_CATEGORY_ID',
  'MAILCHIMP_KIND_CATEGORY_ID',
  'BELGA_FTP_USERNAME',
  'BELGA_FTP_PASSWORD'
];


requiredEnvironmentVariables.forEach((key) => {
  if (!process.env[key]) {
    console.log('---------------------------------------------------------------');
    console.log(`[ERROR]:Environment variable ${key} must be configured`);
    console.log('---------------------------------------------------------------');
    process.exit(1);
  }
});

const belgaConfig = {
  user,
  password,
  host
};
const belgaService = new BelgaService(belgaConfig);
const mailchimpService = new MailchimpService();

/**
 * Prepare new MailChimp campaign
 */
app.post('/mail-campaigns', async function (req, res) {
  try {
    const meetingId = req.body.data.meetingId;
    if (!meetingId) {
      throw new Error('Mandatory parameter meetingId not found.');
    }
    console.log(`Preparing new MailChimp campaign for meeting ${meetingId}`);

    const agendaInformationForNewsLetter = await getAgendaInformationForNewsletter(meetingId);
    const campaign = await mailchimpService.prepareCampaign(agendaInformationForNewsLetter);

    res.status(201).send({
      data: {
        type: 'mail-campaign',
        id: campaign.campaignId,
        attributes: {
          webId: campaign.webId,
          archiveUrl: campaign.archiveUrl
        }
      },
      relationships: {
        meeting: {
          data: {
            type: "meeting",
            id: meetingId
          }
        }
      }
    });
  } catch (error) {
    console.log("A problem occured when prepairing campaign in Mailchimp.");
    if (error.response) {
      console.log(`${error.status} ${error.response.body.title}: ${error.response.body.detail}`);
    } else {
      console.log(error);
    }
    res.status(500).send(error);
  }
});

/**
 * Send campaign from Mailchimp
 */
app.post('/mail-campaigns/:id/send', async (req, res) => {
  try {
    const campaignId = req.params.id;
    if (!campaignId ) {
      throw new Error('Request parameter id can not be null.');
    }
    console.log(`Sending MailChimp campaign ${campaignId}`);
    await mailchimpService.sendCampaign(campaignId);
    res.status(201).send({
      data: {
        type: 'mail-campaign',
        id: campaignId
      }
    });
  } catch (error) {
    console.log(`A problem occured when sending campaign in Mailchimp.`);
    if (error.response) {
      console.log(`${error.status} ${error.response.body.title}: ${error.response.body.detail}`);
    } else {
      console.log(error);
    }
    res.status(500).send(error);
  }
});

/**
 * Get campaign meta data
 */
app.get('/mail-campaigns/:id', async (req, res) => {
  try {
    const campaignId = req.params.id;
    if (!campaignId ) {
      throw new Error('Request parameter id can not be null.');
    }
    console.log(`Getting meta data for MailChimp campaign ${campaignId}`);

    const campaignData = await mailchimpService.getCampaignData(campaignId);
    res.status(200).send({
      data: {
        type: 'mail-campaign',
        id: campaignData.id,
        attributes: {
          createTime: campaignData.create_time,
        }
      }
    });
  } catch (error) {
    console.log(`A problem occured when getting campaign content for in Mailchimp.`);
    if (error.response) {
      console.log(`${error.status} ${error.response.body.title}: ${error.response.body.detail}`);
    } else {
      console.log(error);
    }
    res.status(500).send(error);
  }
});

/**
 * Get campaign content
 */
app.get('/mail-campaign/:id/content', async (req, res) => {
  try {
    const campaignId = req.params.id;
    if (!campaignId ) {
      throw new Error('Request parameter id can not be null.');
    }
    console.log(`Get content for MailChimp campaign ${campaignId}`);

    const campaignHtml = await mailchimpService.getCampaignContent(campaignId);
    res.send({
      data: {
        type: 'mail-campaign-content',
        id: campaignId,
        attributes: {
          html: campaignHtml.html
        }
      }
    });
  } catch (error) {
    console.log(`A problem occured when getting campaign content in Mailchimp.`);
    if (error.response) {
      console.log(`${error.status} ${error.response.body.title}: ${error.response.body.detail}`);
    } else {
      console.log(error);
    }
    next(error);
  }
});

/**
 * Delete campaign from Mailchimp
 */
app.delete('/mail-campaigns/:id', async (req, res) => {
  try {
    const campaignId = req.params.id;
    if (!campaignId ) {
      throw new Error('Request parameter id can not be null.');
    }

    await mailchimpService.deleteCampaign(campaignId);
    res.status(204).send();
  } catch (error) {
    console.log(`A problem occured when deleting campaign ${campaignId} in Mailchimp.`);
    if (error.response) {
      console.log(`${error.status} ${error.response.body.title}: ${error.response.body.detail}`);
    } else {
      console.log(error);
    }
    res.status(500).send(error);
  }
});

/**
 * Send newsletter to Belga
 */
app.post('/belga-newsletters', async (req, res) => {
  const meetingId = req.body.data.meetingId;
  if (!meetingId) {
    throw new Error('Mandatory parameter meetingId not found.');
  }
  try {
    const belgaNewsletter = await belgaService.generateXML(meetingId, true);
    res.status(201).send({
      data: {
        id: belgaNewsletter.name,
        type: 'belga-newsletter'
      },
      relationships: {
        meeting: {
          data: {
            type: "meeting",
            id: meetingId
          }
        }
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).send({
      errors: [{
        status: 500,
        title: 'Send to Belga failed.',
        detail: (err.message || 'Something went wrong while sending to Belga.')
      }]
    });
  }
});

app.get('/belga-newsletters/:id', async (req, res) => {
  let meetingId = req.params.id;
  try {
    const belgaNewsletter = await belgaService.generateXML(meetingId);
    res.download(belgaNewsletter);
  } catch (err) {
    console.error(err);
    res.status(500).send({
      errors: [{
        status: 500,
        title: 'Get XML failed.',
        detail: (err.message || 'Something went wrong while downloading the XML.')
      }]
    });
  }
});
