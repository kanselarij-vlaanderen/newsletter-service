import {errorHandler} from 'mu';
import {ok} from 'assert';
import BelgaService from "./repository/belga-service";

const app = mu.app;

const Mailchimp = require('mailchimp-api-v3');
const mailchimpService = require('./repository/mailchimp-service');
const mailchimp = new Mailchimp(process.env.MAILCHIMP_API || '');

const bodyParser = require('body-parser');
const cors = require('cors');
const dotenv = require('dotenv');
dotenv.config();

const user = process.env.BELGA_FTP_USERNAME;
const password = process.env.BELGA_FTP_PASSWORD;
const host = 'ftp.belga.be';

const belgaConfig = {
    user,
    password,
    host
};
const belgaService = new BelgaService(belgaConfig);

app.use(bodyParser.json({type: 'application/*+json'}));
app.use(errorHandler);
const cacheClearTimeout = process.env.CACHE_CLEAR_TIMEOUT || 1500;

app.post('/mailCampaign', async (req, res) => {
    const agendaId = req.body.agendaId;
    if (!agendaId) {
        throw new Error('No agenda id.');
    }
    try {
        const mailCampaign = mailchimpService.createCampaign(agendaId);
        setTimeout(() => {
            res.send({status: ok, statusCode: 201, data: {"id": mailCampaign.campaign_id, "webcampaign-id":mailCampaign.campaign_web_id,"archive-url":mailCampaign.url}});
        }, cacheClearTimeout);
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

app.put('/mailCampaign', async (req, res, next) => {
    const campaignId = req.body.id;
    if (!campaignId) {
        throw new Error('No campaign id.');
    }
    try {
        const sendCampaign = await mailchimp.post({
            path: `/campaigns/${campaignId}/actions/send`
        });
        setTimeout(() => {
            res.send({status: ok, statusCode: 200, data: {"type": "mail-campaign", "mail-campaign": sendCampaign}});
        }, cacheClearTimeout);
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

app.get('/mailCampaign', async (req, res, next) => {
    const campaignId = req.body.campaignId;
    try {
        const mailchimpCampaign = await mailchimp.get({
            path: `/campaigns/${campaignId}/content`
        });
        setTimeout(() => {
            res.send({status: ok, statusCode: 200, data: {"mailchimp-campaign": mailchimpCampaign}});
        }, cacheClearTimeout);
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
        setTimeout(() => {
            res.send({status: ok, statusCode: 200});
        }, cacheClearTimeout);
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

app.post('/belga', async (req, res, next) => {
    const agendaId = req.body.agendaId;
    if (!agendaId) {
        throw new Error('No agenda provided.');
    }
    try {
        await belgaService.generateXML(agendaId, true);
        setTimeout(() => {
            res.send({status: ok, statusCode: 201});
        }, cacheClearTimeout);
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
        setTimeout(() => {
            res.download(generatedXMLPath);
            res.send({status: ok, statusCode: 200});
        }, cacheClearTimeout);
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

// TODO Delete if no longer needed
// app.get('/fetchTestMailCampaignMetaData/:id', async (req, res, next) => {
//     const campaign_id = req.params.id;
//     try {
//         console.time('FETCH CAMPAIGN METADATA');
//         const campaignHTML = await mailchimp.get({
//             path: `/campaigns/${campaign_id}`
//         });
//         console.timeEnd('FETCH CAMPAIGN METADATA');
//         res.send({body: campaignHTML});
//     } catch (error) {
//         next(error);
//     }
// });
