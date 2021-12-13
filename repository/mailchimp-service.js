import {createNewsLetter, getNewsItem} from "../util/html";
import {reduceNewslettersToMandateesByPriority} from "../util/newsletter";
import * as repository from "./index";

const moment = require('moment');
const Mailchimp = require('mailchimp-api-v3');

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
const createCampaign = async (agendaId) => {
    const {
        formattedStart,
        formattedDocumentDate,
        agendaURI,
        procedureText,
        kindOfMeeting,
        mailSubjectPrefix,
    } = await repository.getAgendaNewsletterInformation(agendaId);

    let newsletter = await repository.getNewsLetterByAgendaId(agendaURI);

    if (!newsletter || !newsletter[0]) {
        throw new Error('No newsletters present!');
    }

    const reducedNewsletters = reduceNewslettersToMandateesByPriority(newsletter);

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

    let html = createNewsLetter(news_items_HTML, formattedStart, formattedDocumentDate, procedureText, kindOfMeeting);

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

    const campaign = await createNewCampaignObject(created_template, formattedStart, allThemesOfNewsletter, mailSubjectPrefix);

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
    return createdCampagne;
};

const deleteCampaign = async (id) => {
    console.time('DELETE MAILCHIMP CAMPAIGN TIME');
    const deletedCampaign = await mailchimp.delete({
        path: `/campaigns/${id}`
    });
    console.timeEnd('DELETE MAILCHIMP CAMPAIGN TIME');
    return deletedCampaign;
};

const getCampaign = async (id) => {
    console.time('GET MAILCHIMP CAMPAIGN TIME');
    const campaign = await mailchimp.get({
        path: `/campaigns/${id}/content`
    });
    console.timeEnd('GET MAILCHIMP CAMPAIGN TIME');
    return campaign;
};

const sendCampaign = async (id) => {
    console.time('SEND MAILCHIMP CAMPAIGN TIME');
    const campaign = await mailchimp.post({
        path: `/campaigns/${id}/actions/send`
    });
    console.timeEnd('SEND MAILCHIMP CAMPAIGN TIME');
    return campaign;
};

export {deleteCampaign, createCampaign, getCampaign ,sendCampaign};

/** This function creates the beginning of a merge-tag-block.
 * https://mailchimp.com/help/use-conditional-merge-tag-blocks/#Use_Groups_with_Conditional_Merge_Tag_Blocks
 */
const createBeginSegment = (themesString, segmentPrefix = "Thema's") => {
    return `*|INTERESTED:${segmentPrefix}:${themesString}|*`;
};
const createEndSegment = () => {
    return `*|END:INTERESTED|*`;
};
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
const createNewCampaignObject = async (created_template, formattedStart, allThemesOfNewsletter, mailSubjectPrefix) => {
    const {id} = created_template;
    console.time('FETCH MAILCHIMP CONFIG TIME');
    const themeCondition = await createThemesCondition(allThemesOfNewsletter);
    const kindCondition = await createKindCondition();
    console.timeEnd('FETCH MAILCHIMP CONFIG TIME');
    console.log('CONDITIONS_USED:', JSON.stringify([themeCondition, kindCondition]));
    // mailSubjectPrefix is the kind of meeting
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
            subject_line: `${mailSubjectPrefix}: beslissingen van ${formattedStart}`,
            preview_text: `${mailSubjectPrefix}: beslissingen van ${formattedStart}`,
            title: `${mailSubjectPrefix}: beslissingen van ${formattedStart}`,
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
