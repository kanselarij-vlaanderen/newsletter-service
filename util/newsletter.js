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
                    priority: alphaNumericPriority(newsItem.mandateePriority),
                    title: newsItem.mandateeTitle,
                    nickName: newsItem.mandateeName
                });
            } else {
                newsItem.mandatees = [
                    {
                        priority: alphaNumericPriority(newsItem.mandateePriority),
                        title: newsItem.mandateeTitle,
                        nickName: newsItem.mandateeName
                    }
                ];
                delete newsItem.mandateeTitle;
                delete newsItem.mandateePriority;
                uniqueNewsletters.push(newsItem);
            }
            return uniqueNewsletters;
        }, [])
    );
};
/**
 * Returns a joined list of all items formatted in a readable string
 * @param {title: string, proposal: string, richtext:string} data -> list of items
 */
const createNewsletterString = (data) => {
    let agendaitems = [];
    const reducedNewsletters = reduceNewslettersToMandateesByPriority(data);

    reducedNewsletters.map((newsletterItem) => {
        agendaitems.push(
            `<p>
      ${newsletterItem.title || ''}
      ${newsletterItem.proposalText || ''}
      ${newsletterItem.richtext || ''}
      </p>`
                .replace(/^\s+|\s+$/gm, '')
                .replace(/(?=<!--)([\s\S]*?)-->/gm, '')
                .replace(/\n&nbsp;*/gm, '')
                .trim()
        );
    });
    return agendaitems.join(``);
};

/**
 * @param {*} sortedMandatees (mandatees sorted by priority)
 * returns a computed proposalName based on the mandatees
 */
const computeProposalTextForNewsletterItem = (sortedMandatees) => {
    let proposalText = "Op voorstel van ";
    const seperatorComma = ", ";
    const seperatorAnd = " en ";
    if (sortedMandatees && sortedMandatees.length > 0) {
        for (let i = 0; i < sortedMandatees.length; i++) {
            let mandatee = sortedMandatees[i];
            const nickName = mandatee.nickName;
            if (i > 0) {
                if (sortedMandatees.length - 1 === i) {
                    proposalText = `${proposalText}${seperatorAnd}`;
                } else {
                    proposalText = `${proposalText}${seperatorComma}`;
                }
            }
            if (nickName) {
                proposalText = `${proposalText}${nickName}`;
            } else {
                if (!mandatee.title) {
                    return "";
                }
                proposalText = `${proposalText}${mandatee.title}`;
            }
        }
        return proposalText;
    }
    return "";
};

const findExistingItem = (list, item) => {
    return list.find((listItem) => listItem.newsletter === item.newsletter);
};

const sortNewsletterItems = (items) => {
    return items.sort((a,b) => {
        if (a.groupPriority === b.groupPriority) {
            return parseInt(a.agendaitemPrio) - parseInt(b.agendaitemPrio);
        }
        return a.groupPriority > b.groupPriority ? 1 : -1;
    })
}

const setCalculatedPrioritiesOfNewsletter = (uniqueNewsletters) => {
    uniqueNewsletters.map((newsItemWithMandatees) => {
        const sortedMandatees = newsItemWithMandatees.mandatees.sort((a, b) => a.priority - b.priority);
        const groupName = [...new Set(sortedMandatees.map((item) => item.title))].join(",");
        const priorities = [...new Set(sortedMandatees.map((item) => item.priority))];

        const proposalText = computeProposalTextForNewsletterItem([...new Set(sortedMandatees)]);

        let alphaNumericPrio;
        if (priorities.length > 0) {
            // the priorities are letters of the alphabet to do a alphanumeric sort, make 1 string of them
            alphaNumericPrio = priorities.join();
        } else {
            // no mandatees means lowest priority
            alphaNumericPrio = 'ZZZZZZZZ';
        }

        // assign new properties used for sorting.
        newsItemWithMandatees.groupName = groupName;
        newsItemWithMandatees.groupPriority = alphaNumericPrio;
        newsItemWithMandatees.proposalText = proposalText;
        return newsItemWithMandatees;
    });
    return sortNewsletterItems(uniqueNewsletters);
};

const alphaNumericPriority = (mandateePriority) => {
    const alphabet = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'];
    if (mandateePriority) {
        const priority = parseInt(mandateePriority);
        return alphabet[priority - 1];
    }
    return 'ZZZZZZZZ'
}

export { reduceNewslettersToMandateesByPriority, createNewsletterString };
