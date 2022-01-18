import {app} from 'mu';
import BelgaService from './repository/belga-service';
import * as mailchimpService from './repository/mailchimp-service';

const user = process.env.BELGA_FTP_USERNAME;
const password = process.env.BELGA_FTP_PASSWORD;
const host =  process.env.BELGA_FTP_HOST;;

const belgaConfig = {
  user,
  password,
  host
};
const belgaService = new BelgaService(belgaConfig);


app.post('/mail-campaign', async (req, res) => {
  const meetingId = req.body.data.meetingId;
  try {
    const mailCampaign = await mailchimpService.createCampaign(meetingId);
    res.send({
      status: ok, statusCode: 201,
      data:
        {
          'type': 'mail-campaign',
          'id': mailCampaign.id,
          'attributes': {
            'webId': mailCampaign.web_id,
            'archiveUrl': mailCampaign.archive_url
          }
        }
    });
  } catch (err) {
    console.error(err);
    res.status(500).send({
      error: {
        status: 500,
        title: 'Create mail campaign failed.',
        detail: (err.message || 'Something went wrong during the creation of the mail campaign.')
      }
    });
  }
});

app.post('/send-mail-campaign', async (req, res) => {
  const campaignId = req.body.data.id;
  try {
    const sendCampaign = await mailchimpService.sendCampaign(campaignId);
    res.send({
      status: ok, statusCode: 201,
      data: {
        'type': 'mail-campaign',
        'id': sendCampaign.id
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).send({
      error: {
        status: 500,
        title: 'Send mail campaign failed.',
        detail: (err.message || 'Something went wrong while sending the mail campaign.')
      }
    });
  }
});

app.get('/mail-campaign/:id', async (req, res) => {
  const campaignId = req.params.id;
  try {
    const mailchimpCampaign = await mailchimpService.getCampaign(campaignId);
    res.send({
      status: ok, statusCode: 200, data: {
        'type': 'mail-chimp-campaign',
        'id': mailchimpCampaign.id,
        'attributes': {
          'createTime': mailchimpCampaign.create_time,
        }
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).send({
      error: {
        status: 500,
        title: 'Get Mailchimp campaign failed.',
        detail: (err.message || 'Something went wrong while fetching the mailchimp campaign.')
      }
    });
  }
});

app.get('/mail-campaign-content/:id', async (req, res) => {
  const campaignId = req.params.id;
  try {
    const mailchimpCampaign = await mailchimpService.getCampaignContent(campaignId);
    res.send({
      status: ok, statusCode: 200, data: {
        'type': 'mail-chimp-campaign',
        'id': campaignId,
        'attributes': {
          'html': mailchimpCampaign.html,
        }
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).send({
      error: {
        status: 500,
        title: 'Get Mailchimp campaign failed.',
        detail: (err.message || 'Something went wrong while fetching the mailchimp campaign.')
      }
    });
  }
});


app.delete('/mail-campaign/:id', async (req, res) => {
  const campaignId = req.params.id;
  try {
    await mailchimpService.deleteCampaign(campaignId);
    res.send({status: ok, statusCode: 200});
  } catch (err) {
    console.error(err);
    res.status(500).send({
      error: {
        status: 500,
        title: 'Delete mail campaign failed.',
        detail: (err.message || 'Something went wrong while deleting mail campaign.')
      }
    });
  }
});

app.post('/belga', async (req, res) => {
  const meetingId = req.body.data.meetingId;
  try {
    await belgaService.generateXML(meetingId, true);
    res.send({status: ok, statusCode: 200, data: {type: 'belga-campaign'}});
  } catch (err) {
    console.error(err);
    res.status(500).send({
      error: {
        status: 500,
        title: 'Send to Belga failed.',
        detail: (err.message || 'Something went wrong while sending to Belga.')
      }
    });
  }
});

app.get('/belga/:meeting-id', async (req, res) => {
  let meetingId = req.params.meeting - id;
  try {
    const generatedXMLPath = await belgaService.generateXML(meetingId);
    res.download(generatedXMLPath);
    res.send({
      status: ok, statusCode: 200, data:
        {type: 'belga-campaign'}
    });
  } catch (err) {
    console.error(err);
    res.status(500).send({
      error: {
        status: 500,
        title: 'Get XML failed.',
        detail: (err.message || 'Something went wrong while downloading the XML.')
      }
    });
  }
});
