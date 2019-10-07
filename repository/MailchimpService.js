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

    const reducedNewsletters = reduceNewslettersToMandateesByPriority(newsletter);

    const news_items_HTML = reducedNewsletters.map((item) => {
      let segmentConstraint = { begin: '', end: '' };
      if (item && item.themes) {
        segmentConstraint = {
          begin: createBeginSegment(item.themes),
          end: createEndSegment(),
        };
      }
      return getNewsItem(item, segmentConstraint);
    });
    let html = await createNewsLetter(news_items_HTML, formattedStart, formattedDocumentDate);

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
  return `*|INTERESTED:${segmentPrefix}:${[...new Set(themesString.split(","))].join(',')}|*`;
};

const createEndSegment = () => {
  return `*|END:INTERESTED|*`;
};

/**
 * This function will be reducing all the newsletter-info objects to a list of groups.
 * These groups will be prioritised by a calculated priority (because they have multiple prioritities)
 * E.G:               mandatee - priority
 *      first group:  Mandatee1 - 1
 *      second group: Mandatee1 - 1, mandatee2 - 2
 *      third group:  Mandatee1 - 1, mandatee2 - 2, mandatee3 - priority 3
 *      fourth group: Mandatee1 - 1, mandatee3 - 3
 * This is different from the normal priority of the agendaitems in the agenda.
 */
const reduceNewslettersToMandateesByPriority = (newsletter) => {
  return newsletter
    .reduce((uniqueNewsletters, newsItem) => {
      const foundItem = findExistingItem(uniqueNewsletters, newsItem);
      if (foundItem) {
        const indexOf = uniqueNewsletters.indexOf(foundItem);
        uniqueNewsletters[indexOf].mandatees.push({
          priority: parseInt(newsItem.mandateePriority),
          title: newsItem.mandateeTitle,
        });
      } else {
        newsItem.mandatees = [
          { priority: parseInt(newsItem.mandateePriority), title: newsItem.mandateeTitle },
        ];
        delete newsItem.mandateeTitle;
        delete newsItem.mandateePriority;
        uniqueNewsletters.push(newsItem);
      }
      return uniqueNewsletters;
    }, [])
    .map((newsItemWithMandatees) => {
      const sortedMandatees = newsItemWithMandatees.mandatees.sort(
        (a, b) => a.priority - b.priority
      );
      const groupName = [...new Set(sortedMandatees.map((item) => item.title))].join(',');
      const priorities = [...new Set(sortedMandatees.map((item) => item.priority))];

      // catch with 2147000, because Math-min of an empty array is -Infinity and if there is no priority it should be last.
      const minPrio = Math.min(...priorities) || 2147000;

      priorities.shift();
      let calculatedPrio = minPrio;

      if (priorities.length > 0) {
        priorities.map((priority) => {
          calculatedPrio += priority / 100;
        });
      }

      // assign new properties used for sorting.
      newsItemWithMandatees.groupName = groupName;
      newsItemWithMandatees.groupPriority = calculatedPrio;

      return newsItemWithMandatees;
    })
    .sort((a, b) => a.groupPriority - b.groupPriority);
};

const findExistingItem = (list, item) => {
  return list.find((listItem) => listItem.newsletter === item.newsletter);
};
export { deleteCampaign, createCampaign };
