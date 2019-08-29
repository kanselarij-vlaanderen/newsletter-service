import mu from 'mu';
import { ok } from 'assert';

const app = mu.app;
const bodyParser = require('body-parser');
const repository = require('./repository');
const cors = require('cors');

const { createNewsLetter } = require('./html-renderer/NewsLetter');
const { getNewsItem } = require('./html-renderer/NewsItem');

const dotenv = require('dotenv');
dotenv.config();

const Mailchimp = require('mailchimp-api-v3');
<<<<<<< HEAD
let mailchimp;
try {
  mailchimp = new Mailchimp(process.env.MAILCHIMP_API);
} catch {
  console.error('could not find mailchimp API key');
}
=======
const mailchimp = new Mailchimp(process.env.MAILCHIMP_API || '');
>>>>>>> 9629af9e4a876a8a385ad8068c38989a141f1378
const moment = require('moment');
const fromName = 'Kaleidos';
const replyTo = 'joachim.zeelmaekers@craftworkz.be';

moment.locale('nl');

app.use(bodyParser.json({ type: 'application/*+json' }));
app.use(cors());

app.post('/createCampaign', (req, res) => {
  return createCampagne(req, res);
});

app.get('/', (req, res) => {
  return getMostRecentNewsletter(req, res);
});

const getMostRecentNewsletter = async (req, res) => {
  try {
    let response = await repository.getAgendaWhereisMostRecentAndFinal();
    const { agenda_uuid } = response[0] || {};

    if (!agenda_uuid) {
      res.send({ status: ok, statusCode: 500, newsletter: [] });
    } else {
      let newsletter = await repository.getNewsLetterByAgendaId(agenda_uuid);
      if (!newsletter) {
        throw new Error('no newsletters present');
      }

      newsletter = newsletter.filter((newsletter_item) => {
        if (newsletter_item.finished) {
          let item = {};
          item.id = newsletter_item.uuid;
          item.webtitle = newsletter_item.title;
          item.description = newsletter_item.richtext;
          item.body = newsletter_item.text;
          item.publication_date = newsletter_item.created;
          item.modification_date = newsletter_item.modified;
          item.type = 'agenda_item';
          if (item.remark) {
            item.agenda_item_type = 'Opmerking';
          } else {
            item.agenda_item_type = 'Beslissing';
          }
          return item;
        }
      });

      res.send({
        total: newsletter.length,
        size: newsletter.length,
        items: newsletter,
      });
    }
  } catch (error) {
    console.error(error);
    res.send({ status: ok, statusCode: 500, body: { error } });
  }
};

const createCampagne = async (req, res) => {
  try {
    const agendaId = req.query.agendaId;
    if (!agendaId) {
      throw new Error('Request parameter agendaId can not be null');
    }

    let newsletter = (await repository.getNewsLetterByAgendaId(agendaId))
    if (!newsletter) {
      throw new Error('no newsletters present');
    }

    const planned_start = moment(newsletter[0].planned_start).format('dddd DD-MM-YYYY');
    const news_items_HTML = await newsletter.map((item) => getNewsItem(item));
    let html = await createNewsLetter(news_items_HTML, planned_start);

    const template = {
      name: `Nieuwsbrief ${planned_start}`,
      html,
    };

    const created_template = await mailchimp.post({
      path: '/templates',
      body: template,
    });

    const { id } = created_template;
    const campaign = {
      type: 'regular',
      recipients: {
        list_id: '5480352579',
      },
      settings: {
        subject_line: `Nieuwsbrief ${planned_start}`,
        preview_text: '',
        title: `Nieuwsbrief ${planned_start}`,
        from_name: fromName,
        reply_to: replyTo,
        inline_css: true,
        template_id: id,
      },
    };

    const createdCampagne = await mailchimp.post({
      path: '/campaigns',
      body: campaign,
    });

    const { web_id, archive_url } = createdCampagne;

    res.send({
      status: ok,
      statusCode: 200,
      body: {
        campaign_id: createdCampagne.id,
        campaign_web_id: web_id,
        archive_url,
      },
    });
  } catch (error) {
    console.error(error);
    res.send({ status: ok, statusCode: 500, body: { error } });
  }
};

app.delete('/deleteCampaign/:id', async (req, res) => {
  const campaign_id = req.params.id;
  if (!campaign_id) {
    throw new Error('Request parameter campaign_id can not be null');
  }
  const deleted = await deleteCampaign(campaign_id);
  res.send({ deleted });
});

const deleteCampaign = (id) => {
  return mailchimp.delete({
    path: `/campaigns/${id}`,
  });
};

app.post('/sendCampaign/:id', async (req, res) => {
  const campaign_id = req.params.id;
  const sendCampaign = await mailchimp.post({
    path: `/campaigns/${campaign_id}/actions/send`,
  });

  res.send({ sendCampaign });
});
