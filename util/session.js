import { query, sparqlEscapeUri } from 'mu';

const ROLES = {
  ADMIN: 'http://themis.vlaanderen.be/id/gebruikersrol/9a969b13-e80b-424f-8a82-a402bcb42bc5',
  KANSELARIJ: 'http://themis.vlaanderen.be/id/gebruikersrol/ab39b02a-14a5-4aa9-90bd-e0fa268b0f3d',
  SECRETARIE: 'http://themis.vlaanderen.be/id/gebruikersrol/c2ef1785-bf28-458f-952d-aa40989347d2',
  KORT_BESTEK: 'http://themis.vlaanderen.be/id/gebruikersrol/ca20a872-7743-4998-b479-06b003f49daf',
}

async function sessionIsAuthorized(sessionUri) {
  const roleUris = [
    ROLES.ADMIN,
    ROLES.KANSELARIJ,
    ROLES.SECRETARIE,
    ROLES.KORT_BESTEK,
  ];

  const queryString = `PREFIX session: <http://mu.semte.ch/vocabularies/session/>
PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
PREFIX org: <http://www.w3.org/ns/org#>

ASK {
  VALUES (?roleUri) {
    ${roleUris.map(uri => `(${sparqlEscapeUri(uri)})`).join(`
    `)}
  }

  ${sparqlEscapeUri(sessionUri)} session:account ?account ;
    ext:sessionMembership / org:role ?roleUri .
}`;
  const response = await query(queryString);
  return response.boolean;
}

export {
  sessionIsAuthorized,
}
