import { app } from 'mu';
import { prepareCampaign, sendCampaign, deleteCampaign, getCampaignContent, getCampaignData } from './repository/mailchimp-service';
import { getAgendaInformationForNewsletter } from './util/query-helper';
import BelgaService from './repository/belga-service';

const user = process.env.BELGA_FTP_USERNAME;
const password = process.env.BELGA_FTP_PASSWORD;
const host = process.env.BELGA_FTP_HOST;

const belgaConfig = {
  user,
  password,
  host
};
const belgaService = new BelgaService(belgaConfig);

/**
 * Prepare new MailChimp campaign
 */
app.post('/mail-campaigns', async function (req, res) {
  try {
    const meetingId = req.body.data.meetingId;
    if (!meetingId) {
      throw new Error('Mandatory parameter meetingId not found.');
    }
    const agendaInformationForNewsLetter = await getAgendaInformationForNewsletter(meetingId);
    const campaign = await prepareCampaign(agendaInformationForNewsLetter);

    res.status(201).send({
      data: {
        type: 'mail-campaign',
        id: campaign.campaignId, // TODO check if this exists
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
    console.log("A problem occured when prepairing a campaign in Mailchimp.");
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

    const sendCampaignResult = await sendCampaign(campaignId);
    res.status(201).send({
      data: {
        type: 'mail-campaign',
        id: sendCampaignResult.campaignId // TODO is this correct?
      }
    });
  } catch (error) {
    console.log(`A problem occured when sending campaign ${campaignId} in Mailchimp.`);
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

    const campaignData = await getCampaignData(campaignId);
    res.send({
      data: {
        type: 'mail-campaign',
        id: campaignData.campaignId, // TODO is this correct?
        attributes: {
          createTime: campaignData.create_time,
        }
      }
    });
  } catch (error) {
    console.log(`A problem occured when getting campaign content for campaign id ${campaignId} in Mailchimp.`);
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

    const campaignHtml = await getCampaignContent(campaignId);
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
    console.log(`A problem occured when getting campaign content for campaign id ${campaignId} in Mailchimp.`);
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

    await deleteCampaign(campaignId);
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
