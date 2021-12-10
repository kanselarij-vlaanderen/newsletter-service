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

app.post('/mailCampaign', async (req, res) => {
    const agendaId = req.body.agendaId;
    if (!agendaId) {
        throw new Error('No agenda id.');
    }
    try {
        const mailCampaign = await mailchimpService.createCampaign(agendaId);
        res.send({
            status: ok, statusCode: 201, data:
                {
                    'id': mailCampaign.id,
                    'webId': mailCampaign.web_id,
                    'archiveUrl': mailCampaign.archive_url
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

app.post('/sendMailCampaign', async (req, res) => {
    const campaignId = req.body.id;
    if (!campaignId) {
        throw new Error('No campaign id.');
    }
    try {
        const sendCampaign = await mailchimpService.sendCampaign(campaignId);
        res.send({status: ok, statusCode: 201, data: {"type": "mail-campaign", "mail-campaign": sendCampaign}});

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

app.get('/mailCampaign', async (req, res) => {
    const campaignId = req.body.id;
    try {
        const mailchimpCampaign = await mailchimpService.getCampaign(campaignId);
        res.send({status: ok, statusCode: 200, data: {"mailchimp-campaign": mailchimpCampaign}});
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

app.delete('/mailCampaign', async (req, res) => {
    const campaignId = req.body.id;
    if (!campaignId) {
        throw new Error('No Campaign Id provided');
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

app.get('/belga', async (req, res) => {
    let agendaId = req.body.agendaId;
    if (!agendaId) {
        throw new Error('No agenda provided.');
    }
    try {
        const generatedXMLPath = await belgaService.generateXML(agendaId);
        res.download(generatedXMLPath);
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
