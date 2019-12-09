const {createNewsLetter} = require('../html-renderer/NewsLetter');
const {getNewsItem} = require('../html-renderer/NewsItem');
import {ok} from 'assert';

const repository = require('./index.js');
const moment = require('moment');
const Mailchimp = require('mailchimp-api-v3');
const helper = require('../repository/helpers');

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

const mailchimp = new Mailchimp(process.env.MAILCHIMP_API);
const FROM_NAME = process.env.MAILCHIMP_FROM_NAME;
const REPLY_TO = process.env.MAILCHIMP_REPLY_TO;
const LIST_ID = process.env.MAILCHIMP_LIST_ID;
const INTEREST_CATEGORY_ID = process.env.MAILCHIMP_INTEREST_CATEGORY_ID;
const KIND_CATEGORY_ID = process.env.MAILCHIMP_KIND_CATEGORY_ID;

const DECISION_STRINGS = ['Ik ontvang enkel beslissingen', 'Ik ontvang zowel persberichten als beslissingen'];

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
      agendaURI,
      procedureText
    } = await repository.getAgendaNewsletterInformation(agendaId);

    let newsletter = await repository.getNewsLetterByAgendaId(agendaURI);
    if (!newsletter || !newsletter[0]) {
      throw new Error('No newsletters present!');
    }

    const reducedNewsletters = helper.reduceNewslettersToMandateesByPriority(newsletter);
    let allThemesOfNewsletter = [];
    const news_items_HTML = reducedNewsletters.map((item) => {
      let segmentConstraint = {begin: '', end: ''};
      if (item && item.themes) {
        let uniqueThemes = [...new Set(item.themes.split(','))];
        allThemesOfNewsletter.push(...uniqueThemes);

        segmentConstraint = {
          begin: createBeginSegment(uniqueThemes.join(',')),
          end: createEndSegment()
        };
      }
      console.log('PRIORITY:', item.groupPriority);
      return getNewsItem(item, segmentConstraint);
    });
    let html = await createNewsLetter(news_items_HTML, formattedStart, formattedDocumentDate, procedureText);

    const template = {
      name: `Beslissingen van ${formattedStart}`,
      html
    };
    console.time('CREATE MAILCHIMP TEMPLATE TIME');
    const created_template = await mailchimp.post({
      path: '/templates',
      body: template
    });
    console.timeEnd('CREATE MAILCHIMP TEMPLATE TIME');

    const campaign = await createNewCampaignObject(created_template, formattedStart, allThemesOfNewsletter);
    console.time('CREATE MAILCHIMP CAMPAIGN TIME');
    const createdCampagne = await mailchimp.post({
      path: '/campaigns',
      body: campaign
    });
    console.timeEnd('CREATE MAILCHIMP CAMPAIGN TIME');

    console.time('DELETE MAILCHIMP TEMPLATE TIME');
    await mailchimp.delete({
      path: `/templates/${created_template.id}`
    }).catch((error) => {
      console.log(`[MAILCHIMP] Failed to delete template`, error)
    });
    console.timeEnd('DELETE MAILCHIMP TEMPLATE TIME');

    const {web_id, archive_url} = createdCampagne;
    console.log(`Successfully created mailchimp-campaign with id:${web_id}`);
    res.send({
      status: ok,
      statusCode: 200,
      body: {
        campaign_id: createdCampagne.id,
        campaign_web_id: web_id,
        archive_url
      }
    });
  } catch (error) {
    console.log(`CREATE_CAMPAIGN_ERROR:`, error);
    res.status(500).send(error);
  }
};

const deleteCampaign = (id) => {
  return mailchimp.delete({
    path: `/campaigns/${id}`
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

export {deleteCampaign, createCampaign};

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
    value: interestMapping.map((item) => item.id)
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
    value: interestKindMapping.map((item) => item.id)
  };
};

const createNewCampaignObject = async (created_template, formattedStart, allThemesOfNewsletter) => {
  const {id} = created_template;
  console.time('FETCH MAILCHIMP CONFIG TIME');
  const themeCondition = await createThemesCondition(allThemesOfNewsletter);
  const kindCondition = await createKindCondition();
  console.timeEnd('FETCH MAILCHIMP CONFIG TIME');
  console.log('CONDITIONS_USED:', JSON.stringify([themeCondition, kindCondition]));
  const campaign = {
    type: 'regular',
    recipients: {
      list_id: LIST_ID,
      segment_opts: {
        match: 'all',
        conditions: [themeCondition, kindCondition]
      }
    },
    settings: {
      subject_line: `Beslissingen van ${formattedStart}`,
      preview_text: `Beslissingen van ${formattedStart}`,
      title: `Beslissingen van ${formattedStart}`,
      from_name: FROM_NAME,
      reply_to: REPLY_TO,
      inline_css: true,
      template_id: id
    }
  };

  console.log('CREATING CAMPAIGN WITH CONFIG', JSON.stringify(campaign));
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
