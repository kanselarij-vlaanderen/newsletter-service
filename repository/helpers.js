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
export const reduceNewslettersToMandateesByPriority = (newsletter) => {
  return setCalculatedPrioritiesOfNewsletter(
    newsletter.reduce((uniqueNewsletters, newsItem) => {
      const foundItem = findExistingItem(uniqueNewsletters, newsItem);
      if (foundItem) {
        const indexOf = uniqueNewsletters.indexOf(foundItem);
        uniqueNewsletters[indexOf].mandatees.push({
          priority: parseInt(newsItem.mandateePriority),
          title: newsItem.mandateeTitle,
          nickName: newsItem.mandateeName
        });
      } else {
        newsItem.mandatees = [
          {
            priority: parseInt(newsItem.mandateePriority),
            title: newsItem.mandateeTitle,
            nickName: newsItem.mandateeName
          }
        ];
        delete newsItem.mandateeTitle;
        delete newsItem.mandateePriority;
        uniqueNewsletters.push(newsItem);
      }
      return uniqueNewsletters.sort((a, b) => parseInt(a.agendaitemPrio) - parseInt(b.agendaitemPrio));;
    }, [])
  );
};

const setCalculatedPrioritiesOfNewsletter = (uniqueNewsletters) => {
  uniqueNewsletters.map((newsItemWithMandatees) => {
    const sortedMandatees = newsItemWithMandatees.mandatees.sort((a, b) => a.priority - b.priority);
    const groupName = [...new Set(sortedMandatees.map((item) => item.title))].join(",");
    const priorities = [...new Set(sortedMandatees.map((item) => item.priority))];

    const proposalText = computeProposalTextForNewsletterItem([...new Set(sortedMandatees)]);

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
    newsItemWithMandatees.groupPriority = parseFloat(calculatedPrio);
    newsItemWithMandatees.proposalText = proposalText;
    return newsItemWithMandatees;
  });
  return uniqueNewsletters.sort((a, b) => a.groupPriority - b.groupPriority);
};

const findExistingItem = (list, item) => {
  return list.find((listItem) => listItem.newsletter === item.newsletter);
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
        if (sortedMandatees.length - 1 == i) {
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
