/**
 * This function generates a html table to add to the newsletter for publication.
 * @param {title: string, proposal: string, richtext: string, newsletter:uri(string)} NewsItem
 * @param {begin: string, end: string} segmentConstraint
 */
export const getNewsItem = ({ title, proposalText, richtext, newsletter }, segmentConstraint) => {
  console.log(`CREATING NEWSITEM URI: ${newsletter}`);
  console.log(`USING SEGMENT: ${segmentConstraint.begin} CONTENT ${segmentConstraint.end}`);
  return `
    ${segmentConstraint.begin}
    <table mc:repeatable="content" mc:variant="Tekstblok met introtekst" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td height="30" style="height:30px;line-height:0;">
         </td>
      </tr>
      <tr>
        <td style="padding:5px 0 15px 0;">
          <font style="color:#333332;font-family:Calibri, Arial, sans-serif;font-size:26px;font-weight:600;line-height:26px;">${title ||
            ''}</font>
          <p class="intro-text" style="color:#666666;font-family:Calibri, Arial, sans-serif;font-size:15px;line-height:20px;margin-top:5px;margin-bottom:0;">
            ${proposalText || ''}
          </p>
        </td>
      </tr>
      <tr>
        <td style="color:#666666;font-family:Calibri, Arial, sans-serif;font-size:17px;line-height:26px;">
          ${richtext || ''}
        </td>
      </tr>
    </table>
    ${segmentConstraint.end}
  `;
};
