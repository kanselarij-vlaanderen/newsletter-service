const { createNewsLetter } = require('../html-renderer/NewsLetter');
const { getNewsItem } = require('../html-renderer/NewsItem');

const repository = require('./index.js');
const moment = require('moment');
const Mailchimp = require('mailchimp-api-v3');
const mailchimp = new Mailchimp(process.env.MAILCHIMP_API || '');

import { ok } from 'assert';

moment.locale('nl');

const fromName = 'Kaleidos';
const replyTo = 'info@kaleidos.be';

const createCampaign = async (req, res) => {
  try {
    const agendaId = req.query.agendaId;
    if (!agendaId) {
      throw new Error('Request parameter agendaId can not be null');
    }

    const { formattedStart, formattedDocumentDate, formattedPublicationDate } = await repository.getAgendaNewsletterInformation(agendaId);
    
    let newsletter = await repository.getNewsLetterByAgendaId(agendaId);
    if (!newsletter || !newsletter[0]) {
      throw new Error('No newsletters present!');
    }

    const news_items_HTML = await newsletter.map((item) => getNewsItem(item));
    let html = await createNewsLetter(
      news_items_HTML,
      formattedStart,
      formattedDocumentDate,
      formattedPublicationDate
    );

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

const deleteCampaign = (id) => {
  return mailchimp.delete({
    path: `/campaigns/${id}`,
  });
};

export { deleteCampaign, createCampaign };
