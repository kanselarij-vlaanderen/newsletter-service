import { app, errorHandler } from 'mu';
import {
  createMailCampaign,
  getAgendaInformationForNewsletter,
  updateMailCampaignSentTime,
} from './util/query-helper';
import BelgaService from './repository/belga-service';
import MailchimpService from './repository/mailchimp-service';

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

const belgaService = new BelgaService();
const mailchimpService = new MailchimpService();

function logErrorResponse (error) {
  if (error.response) {
    console.log(`${error.status} ${error.response.body.title}: ${error.response.body.detail}`);
  } else {
    console.log(error);
  }
}

/**
 * Prepare new MailChimp campaign
 */
app.post('/mail-campaigns', async function (req, res, next) {
  try {
    const meetingId = req.body?.data?.relationships?.meeting?.data?.id;
    if (!meetingId) {
      const error = new Error('Mandatory parameter meeting-id not found.');
      error.status = 400;
      return next(error);
    }
    console.log(`Preparing new MailChimp campaign for meeting ${meetingId}`);

    const agendaInformationForNewsLetter = await getAgendaInformationForNewsletter(meetingId);
    const campaign = await mailchimpService.prepareCampaign(agendaInformationForNewsLetter);

    const campaignUuid = await createMailCampaign(agendaInformationForNewsLetter.meetingURI, campaign);

    res.status(201).send({
      data: {
        type: 'mail-campaigns',
        id: campaignUuid,
        attributes: {
          'web-id': campaign.web_id,
          'archive-url': campaign.archive_url,
          'campaign-id': campaign.campaignId,
        }
      },
      relationships: {
        meeting: {
          data: { type: 'meetings', id: meetingId }
        }
      }
    });
  } catch (error) {
    console.log('A problem occured when preparing campaign in Mailchimp.');
    logErrorResponse(error);
    next(error);
  }
});

/**
 * Send campaign from Mailchimp
 */
app.post('/mail-campaigns/:id/send', async (req, res, next) => {
  try {
    const campaignId = req.params.id;
    if (!campaignId ) {
      const error = new Error('Mandatory parameter campaign-id not found.');
      error.status = 400;
      return next(error);
    }
    console.log(`Sending MailChimp campaign ${campaignId}`);
    await mailchimpService.sendCampaign(campaignId);
    await updateMailCampaignSentTime(campaignId, new Date());
    res.status(204).send();
  } catch (error) {
    console.log(`A problem occured when sending campaign in Mailchimp.`);
    logErrorResponse(error);
    next(error);
  }
});

/**
 * Get campaign data. Defining the field 'html' in the fieldset returns the html content of the campaign
 */
app.get('/mail-campaigns/:id', async (req, res, next) => {
  try {
    const campaignId = req.params.id;
    if (!campaignId ) {
      const error = new Error('Mandatory parameter campaign-id not found.');
      error.status = 400;
      return next(error);
    }
    console.log(`Getting campaign data for MailChimp campaign ${campaignId}`);

    const queryParams = req.query;
    const getHtml = queryParams.fields && queryParams.fields['mail-campaigns'] && queryParams.fields['mail-campaigns'] === 'html';

    if (getHtml) {
      const campaignHtml = await mailchimpService.getCampaignContent(campaignId);
      res.status(200).send({
        data: {
          type: 'mail-campaigns',
          id: campaignId,
          attributes: {
            html: campaignHtml.html
          }
        }
      });
    } else {
      const campaignData = await mailchimpService.getCampaignData(campaignId);

      res.status(200).send({
        data: {
          type: 'mail-campaigns',
          id: campaignData.id,
          attributes: {
            'create-time': campaignData.create_time,
            'web-id': campaignData.web_id,
            'archive-url': campaignData.archive_url
          }
        }
      });
    }
  } catch (error) {
    console.log(`A problem occured when getting campaign content for in Mailchimp.`);
    logErrorResponse(error);
    next(error);
  }
});


/**
 * Delete campaign from Mailchimp
 */
app.delete('/mail-campaigns/:id', async (req, res, next) => {
  const campaignId = req.params.id;
  try {
    if (!campaignId) {
      const error = new Error('Mandatory parameter campaign-id not found.');
      error.status = 400;
      next(error);
    } else {
      await mailchimpService.deleteCampaign(campaignId);
      res.status(204).send();
    }
  } catch (error) {
    console.log(`A problem occured when deleting campaign ${campaignId} in Mailchimp.`);
    logErrorResponse(error);
    next(error);
  }
});

/**
 * Send newsletter to Belga
 */
app.post('/belga-newsletters', async (req, res, next) => {
  const meetingId = req.body?.data?.relationships?.meeting?.data?.id;
  if (!meetingId) {
    const error = new Error('Mandatory parameter meeting-id not found.');
    error.status = 400;
    next(error);
  } else {
    try {
      const filePath = await belgaService.createBelgaNewsletterXML(meetingId);
      const belgaNewsletter = await belgaService.publishToBelga(filePath);

      res.status(201).send({
        data: {
          id: belgaNewsletter.name,
          type: 'belga-newsletters'
        },
        relationships: {
          meeting: {
            data: {
              type: 'meetings',
              id: meetingId
            }
          }
        }
      });
    } catch (error) {
      console.log(`A problem occured when sending to Belga: ${error.message}`);
      next(error);
    }
  }
});

app.get('/belga-newsletters/:id/download', async (req, res, next) => {
  const meetingId = req.params.id;
  try {
    const belgaNewsletter = await belgaService.generateXML(meetingId);
    res.download(belgaNewsletter);
  } catch (err) {
    console.log(`A problem occured when downloading Belga XML: ${err.message}`);
    next(err);
  }
});

app.use(errorHandler);
