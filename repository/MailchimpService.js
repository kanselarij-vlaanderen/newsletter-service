const { createNewsLetter } = require('../html-renderer/NewsLetter');
const { getNewsItem } = require('../html-renderer/NewsItem');

const repository = require('./index.js');
const moment = require('moment');
const Mailchimp = require('mailchimp-api-v3');
const mailchimp = new Mailchimp(process.env.MAILCHIMP_API || '');
import { ok } from 'assert';

moment.locale('nl');

const fromName = process.env.MAILCHIMP_FROM_NAME || 'Kaleidos';
const replyTo = process.env.MAILCHIMP_REPLY_TO || '';
const list_id = process.env.MAILCHIMP_LIST_ID || 5480352579;

const createCampaign = async (req, res) => {
  try {
    const agendaId = req.query.agendaId;
    if (!agendaId) {
      throw new Error('Request parameter agendaId can not be null');
    }

    const {
      formattedStart,
      formattedDocumentDate,
      formattedPublicationDate,
    } = await repository.getAgendaNewsletterInformation(agendaId);

    let newsletter = await repository.getNewsLetterByAgendaId(agendaId);
    if (!newsletter || !newsletter[0]) {
      throw new Error('No newsletters present!');
    }
    const news_items_HTML = await newsletter.map((item) => {
      let segmentConstraint = { begin: '', end: '' };
      if (item && item.themes) {
        segmentConstraint = {
          begin: createBeginSegment(item.themes),
          end: createEndSegment(),
        };
      }
      return getNewsItem(item, segmentConstraint);
    });
    let html = await createNewsLetter(
      news_items_HTML,
      formattedStart,
      formattedDocumentDate
    );

    const template = {
      name: `Nieuwsbrief ${formattedStart}`,
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
        list_id: list_id,
      },
      settings: {
        subject_line: `Nieuwsbrief ${formattedStart}`,
        preview_text: `Nieuwsbrief ${formattedStart}`,
        title: `Nieuwsbrief ${formattedStart}`,
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

const deleteCampaign = (id) => {
  return mailchimp.delete({
    path: `/campaigns/${id}`,
  });
};

const createBeginSegment = (themesString, segmentPrefix = "Thema's") => {
  return `*|INTERESTED:${segmentPrefix}:${themesString}|*`;
};

const createEndSegment = () => {
  return `*|END:INTERESTED|*`;
};

export { deleteCampaign, createCampaign };
