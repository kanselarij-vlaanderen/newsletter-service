const { createNewsLetter } = require('../html-renderer/NewsLetter');
const { getNewsItem } = require('../html-renderer/NewsItem');
import { ok } from 'assert';

const repository = require('./index.js');
const moment = require('moment');
const Mailchimp = require('mailchimp-api-v3');

const mailchimp = new Mailchimp(process.env.MAILCHIMP_API || '');
const FROM_NAME = process.env.MAILCHIMP_FROM_NAME || 'Kaleidos';
const REPLY_TO = process.env.MAILCHIMP_REPLY_TO || '';
const LIST_ID = process.env.MAILCHIMP_LIST_ID || 5480352579;
const INTEREST_CATEGORY_ID = process.env.MAILCHIMP_INTEREST_CATEGORY_ID || 'fe04dcefd7';
const KIND_CATEGORY_ID = process.env.MAILCHIMP_KIND_CATEGORY_ID || '4757bb85ec';
const DECISION_STRINGS = [
  'Ik ontvang enkel beslissingen',
  'Ik ontvang zowel persberichten als beslissingen',
];

moment.locale('nl');

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
    let allThemesOfNewsletter = [];
    const news_items_HTML = reducedNewsletters.map((item) => {
      let segmentConstraint = { begin: '', end: '' };
      if (item && item.themes) {
        let uniqueThemes = [...new Set(item.themes.split(','))];
        allThemesOfNewsletter.push(...uniqueThemes);

        segmentConstraint = {
          begin: createBeginSegment(uniqueThemes.join(',')),
          end: createEndSegment(),
        };
      }
      return getNewsItem(item, segmentConstraint);
    });

    let html = await createNewsLetter(news_items_HTML, formattedStart, formattedDocumentDate);

    const template = {
      name: `Beslissingen van ${formattedStart}`,
      html,
    };

    const created_template = await mailchimp.post({
      path: '/templates',
      body: template,
    });

    const campaign = await createNewCampaignObject(
      created_template,
      formattedStart,
      allThemesOfNewsletter
    );

    const createdCampagne = await mailchimp.post({
      path: '/campaigns',
      body: campaign,
    });

    const { web_id, archive_url } = createdCampagne;
    console.log(`Successfully created mailchimp-campaign with id:${web_id}`);
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
    console.log(`CREATE_CAMPAIGN_ERROR:`, error);
    res.status(500).send(error);
  }
};

const deleteCampaign = (id) => {
  return mailchimp.delete({
    path: `/campaigns/${id}`,
  });
};

/** This function creates the beginning of a merge-tag-block.
 * https://mailchimp.com/help/use-conditional-merge-tag-blocks/#Use_Groups_with_Conditional_Merge_Tag_Blocks
 */
const createBeginSegment = (themesString, segmentPrefix = "Thema's") => {
  return `*|INTERESTED:${segmentPrefix}:${themesString}|*`;
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
  return setCalculatedPrioritiesOfNewsletter(
    newsletter.reduce((uniqueNewsletters, newsItem) => {
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
  );
};

const setCalculatedPrioritiesOfNewsletter = (uniqueNewsletters) => {
  uniqueNewsletters
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
  return uniqueNewsletters;
};

const findExistingItem = (list, item) => {
  return list.find((listItem) => listItem.newsletter === item.newsletter);
};
export { deleteCampaign, createCampaign };

const createThemesCondition = async (allThemesOfNewsletter) => {
  const allUniqueThemesOfNewsletter = [...new Set(allThemesOfNewsletter)];
  const interests = await fetchInterestsByIdFromLists(INTEREST_CATEGORY_ID);
  const interestMapping = interests.filter((theme) => {
    if (allUniqueThemesOfNewsletter.includes(theme.name)) {
      return theme;
    }
  });
  return {
    condition_type: 'Interests',
    field: `interests-${INTEREST_CATEGORY_ID}`,
    op: 'interestcontains',
    value: interestMapping.map((item) => item.id),
  };
};

const createKindCondition = async () => {
  const interestedKinds = await fetchInterestsByIdFromLists(KIND_CATEGORY_ID);
  const interestKindMapping = interestedKinds.filter((interest) => {
    if (DECISION_STRINGS.includes(interest.name)) {
      return interest;
    }
  });
  return {
    condition_type: 'Interests',
    field: `interests-${KIND_CATEGORY_ID}`,
    op: 'interestcontains',
    value: interestKindMapping.map((item) => item.id),
  };
};

const createNewCampaignObject = async (created_template, formattedStart, allThemesOfNewsletter) => {
  const { id } = created_template;
  const themeCondition = await createThemesCondition(allThemesOfNewsletter);
  const kindCondition = await createKindCondition();
  console.log('CONDITIONS_USED:', JSON.stringify([themeCondition, kindCondition]));
  const campaign = {
    type: 'regular',
    recipients: {
      list_id: LIST_ID,
      segment_opts: {
        match: 'all',
        conditions: [themeCondition, kindCondition],
      },
    },
    settings: {
      subject_line: `Beslissingen van ${formattedStart}`,
      preview_text: `Beslissingen van ${formattedStart}`,
      title: `Beslissingen van ${formattedStart}`,
      from_name: FROM_NAME,
      reply_to: REPLY_TO,
      inline_css: true,
      template_id: id,
    },
  };

  console.log('CREATING CAMPAIGN OBJECT', JSON.stringify(campaign));
  return campaign;
};

/**
 * This function fetches all interests from the mailchimp API
 * By defined LIST_ID and INTEREST_CATEGORY_ID we create a possibility to
 * use the same code for all environments based on these defined env-variables.
 * Returns [{id: string, name: string}]
 * optional parameter ?count:integer default:100
 */
const fetchInterestsByIdFromLists = async (category_id, count = 100) => {
  const interests = await mailchimp.get({
    path: `lists/${LIST_ID}/interest-categories/${category_id}/interests?count=${count}`
  });
  return interests.interests;
};
