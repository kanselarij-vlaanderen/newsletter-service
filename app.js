import {app, errorHandler} from 'mu';
import {ok} from 'assert';
import bodyParser from 'body-parser';
import BelgaService from "./repository/belga-service";
import * as mailchimpService from "./repository/mailchimp-service";

const user = process.env.BELGA_FTP_USERNAME;
const password = process.env.BELGA_FTP_PASSWORD;
const host = 'ftp.belga.be';

const belgaConfig = {
    user,
    password,
    host
};
const belgaService = new BelgaService(belgaConfig);

const dotenv = require('dotenv');
dotenv.config();

app.use(bodyParser.json({type: 'application/*+json'}));
app.use(errorHandler);

app.post('/mail-campaign', async (req, res) => {
    const agendaId = req.body.agendaId;
    if (!agendaId) {
        throw new Error('No agenda id.');
    }
    try {
        const mailCampaign = await mailchimpService.createCampaign(agendaId);
        res.send({
            status: ok, statusCode: 201, data:
                {
                    'type' : 'mail-campaign',
                    'id': mailCampaign.id,
                    'attributes': {
                        'webId': mailCampaign.web_id,
                        'archiveUrl': mailCampaign.archive_url
                    }
                }
        });
    } catch (err) {
        console.error(err);
        res.send({
            error: {
                code: 500,
                title: 'Create mail campaign failed.',
                detail: (err.message || 'Something went wrong during the creation of the mail campaign.')
            }
        });
    }
});

app.post('/send-mail-campaign', async (req, res) => {
    const campaignId = req.body.id;
    if (!campaignId) {
        throw new Error('No campaign id.');
    }
    try {
        const sendCampaign = await mailchimpService.sendCampaign(campaignId);
        res.send({status: ok, statusCode: 201,
            data: {
                'type' : 'mail-campaign',
                'id': sendCampaign.id,
                    'attributes': {
                        'campaign': sendCampaign,
                    }
        }});
    } catch (err) {
        console.error(err);
        res.send({
            error: {
                code: 500,
                title: 'Send mail campaign failed.',
                detail: (err.message || 'Something went wrong while sending the mail campaign.')
            }
        });
    }
});

app.get('/mail-campaign/:id', async (req, res) => {
    const campaignId = req.params.id;
    if (!campaignId) {
        throw new Error('No campaign id provided');
    }
    try {
        const mailchimpCampaign = await mailchimpService.getCampaign(campaignId);
        res.send({status: ok, statusCode: 200, data: {
                'type' : 'mail-chimp-campaign',
                'id': mailchimpCampaign.id,
                'attributes': {
                    'campaign': mailchimpCampaign,
                }
            }});
    } catch (err) {
        console.error(err);
        res.send({
            error: {
                code: 500,
                title: 'Get Mailchimp campaign failed.',
                detail: (err.message || 'Something went wrong while fetching the mailchimp campaign.')
            }
        });
    }
});

app.delete('/mail-campaign/:id', async (req, res) => {
    const campaignId = req.params.id;
    if (!campaignId) {
        throw new Error('No campaign id provided');
    }
    try {
        await mailchimpService.deleteCampaign(campaignId);
        res.send({status: ok, statusCode: 200});
    } catch (err) {
        console.error(err);
        res.send({
            error: {
                code: 500,
                title: 'Delete mail campaign failed.',
                detail: (err.message || 'Something went wrong while deleting mail campaign.')
            }
        });
    }
});

app.post('/belga', async (req, res) => {
    const agendaId = req.body.agendaId;
    if (!agendaId) {
        throw new Error('No agenda provided.');
    }
    try {
        await belgaService.generateXML(agendaId, true);
        res.send({status: ok, statusCode: 200});
    } catch (err) {
        console.error(err);
        res.send({
            error: {
                code: 500,
                title: 'Send to Belga failed.',
                detail: (err.message || 'Something went wrong while sending to Belga.')
            }
        });
    }
});

app.get('/belga/:agenda-id', async (req, res) => {
    let agendaId = req.params.agenda-id;
    if (!agendaId) {
        throw new Error('No agenda provided.');
    }
    try {
        const generatedXMLPath = await belgaService.generateXML(agendaId);
        res.download(generatedXMLPath);
        res.send({status: ok, statusCode: 200});
    } catch (err) {
        console.error(err);
        res.send({
            error: {
                code: 500,
                title: 'Get XML failed.',
                detail: (err.message || 'Something went wrong while downloading the XML.')
            }
        });
    }
});
