// Sanitizer

'use strict';

module.exports = function sanitizer_plugin(md, options) {

  var urlRegex = require('url-regex')({ exact: true })
                 // take the regexp from url-regex
                 .toString()
                 // remove surrounding /(?:^ and $)/i
                 .slice(5, -4),
      escapeHtml = md.utils.escapeHtml;

  options = options ? options : {};
  var removeUnknown = (typeof options.removeUnknown !== 'undefined') ? options.removeUnknown : false;
  var removeUnbalanced = (typeof options.removeUnbalanced !== 'undefined') ? options.removeUnbalanced : false;
  var j;


  var allowedTags = [ 'a', 'b', 'blockquote', 'code', 'em', 'h1', 'h2', 'h3', 'h4', 'h5',
                     'h6', 'li', 'ol', 'p', 'pre', 's', 'sub', 'sup', 'strong', 'ul' ];
  var openTagCount = new Array(allowedTags.length);
  var removeTag = new Array(allowedTags.length);
  for (j = 0; j < allowedTags.length; j++) { openTagCount[j] = 0; }
  for (j = 0; j < allowedTags.length; j++) { removeTag[j] = false; }



  /////////////////////////////////////////////////////////////////////////////////////////////////
  //          REPLACE UNKNOWN TAGS
  /////////////////////////////////////////////////////////////////////////////////////////////////

  function replaceUnknownTags(str) {
    // <a href="url" title="(optional)"></a>
    var patternLinkOpen = '<a\\shref="(' + urlRegex + ')"(?:\\stitle="([^"<>]*)")?>';
    var regexpLinkOpen = RegExp(patternLinkOpen, 'i');
    // <img src="url" alt=""(optional) title=""(optional)>
    var patternImage = '<img\\ssrc="(' + urlRegex + ')"(?:\\salt="([^"<>]*)")?(?:\\stitle="([^"<>]*)")?\\s?\\/?>';
    var regexpImage = RegExp(patternImage, 'i');

    /*
     * it starts with '<' and maybe ends with '>',
     * maybe has a '<' on the right
     * it doesnt have '<' or '>' in between
     * -> it's a tag!
     */
    str = str.replace(/<[^<>]*>?/gi, function (tag) {
      var match, url, alt, title, tagnameIndex;

      // '<->', '<- ' and '<3 ' look nice, they are harmless
      if (/(^<->|^<-\s|^<3\s)/.test(tag)) { return tag; }

      // images
      match = tag.match(regexpImage);
      if (match) {
        url   = match[1];
        alt   = (typeof match[2] !== 'undefined') ? match[2] : '';
        title = (typeof match[3] !== 'undefined') ? match[3] : '';
        // only http and https are allowed for images
        if (/^https?:\/\//i.test(url)) {
          return '<img src="' + url + '" alt="' + alt + '" title="' + title + '">';
        }
      }

      // links
      tagnameIndex = allowedTags.indexOf('a');
      match = tag.match(regexpLinkOpen);
      if (match) {
        title = (typeof match[2] !== 'undefined') ? match[2] : '';
        url   = match[1];
        // only http, https, ftp, mailto and xmpp are allowed for links
        if (/^(?:https?:\/\/|ftp:\/\/|mailto:|xmpp:)/i.test(url)) {
          openTagCount[tagnameIndex] += 1;
          return '<a href="' + url + '" title="' + title + '" target="_blank">';
        }
      }
      match = /<\/a>/i.test(tag);
      if (match) {
        openTagCount[tagnameIndex] -= 1;
        if (openTagCount[tagnameIndex] < 0) {
          removeTag[tagnameIndex] = true;
        }
        return '</a>';
      }

      // standalone tags
      match = tag.match(/<(br|hr)\s?\/?>/i);
      if (match) {
        return '<' + match[1].toLowerCase() + '>';
      }

      // whitelisted tags
      match = tag.match(/<(\/?)(b|blockquote|code|em|h[1-6]|li|ol(?: start="\d+")?|p|pre|s|sub|sup|strong|ul)>/i);
      if (match && !/<\/ol start="\d+"/i.test(tag)) {
        tagnameIndex = allowedTags.indexOf(match[2].toLowerCase().split(' ')[0]);
        if (match[1] === '/') {
          openTagCount[tagnameIndex] -= 1;
        } else {
          openTagCount[tagnameIndex] += 1;
        }
        if (openTagCount[tagnameIndex] < 0) {
          removeTag[tagnameIndex] = true;
        }
        return '<' + match[1] + match[2].toLowerCase() + '>';
      }

      // other tags we don't recognize
      if (removeUnknown === true) {
        return '';
      }
      return escapeHtml(tag);
    });

    return str;
  }


  function sanitizeInlineAndBlock(state) {
    var i, blkIdx, inlineTokens;
    // reset counts
    for (j = 0; j < allowedTags.length; j++) { openTagCount[j] = 0; }
    for (j = 0; j < allowedTags.length; j++) { removeTag[j] = false; }


    for (blkIdx = 0; blkIdx < state.tokens.length; blkIdx++) {
      if (state.tokens[blkIdx].type === 'html_block') {
        state.tokens[blkIdx].content = replaceUnknownTags(state.tokens[blkIdx].content);
      }
      if (state.tokens[blkIdx].type !== 'inline') {
        continue;
      }

      inlineTokens = state.tokens[blkIdx].children;
      for (i = 0; i < inlineTokens.length; i++) {
        if (inlineTokens[i].type === 'html_inline') {
          inlineTokens[i].content = replaceUnknownTags(inlineTokens[i].content);
        }
      }
    }
  }

  /////////////////////////////////////////////////////////////////////////////////////////////////
  //          REPLACE UNBALANCED TAGS
  /////////////////////////////////////////////////////////////////////////////////////////////////

  function balance(state) {

    var blkIdx, inlineTokens;

    function replaceUnbalancedTag(str, tagname) {
      var openingRegexp, closingRegexp;
      if (tagname === 'a') {
        openingRegexp = RegExp('<a href="' + urlRegex + '" title="[^"<>]*" target="_blank">', 'g');
      } else if (tagname === 'ol') {
        openingRegexp = /<ol(?: start="\d+")?>/g;
      } else {
        openingRegexp = RegExp('<' + tagname + '>', 'g');
      }
      closingRegexp = RegExp('</' + tagname + '>', 'g');
      if (removeUnbalanced === true) {
        str = str.replace(openingRegexp, '');
        str = str.replace(closingRegexp, '');
      } else {
        str = str.replace(openingRegexp, function(m) { return escapeHtml(m); });
        str = str.replace(closingRegexp, function(m) { return escapeHtml(m); });
      }
      return str;
    }

    function replaceAllUnbalancedTags(str) {
      var i;
      for (i = 0; i < allowedTags.length; i++) {
        if (removeTag[i] === true) {
          str = replaceUnbalancedTag(str, allowedTags[i]);
        }
      }
      return str;
    }

    for (j = 0; j < allowedTags.length; j++) {
      if (openTagCount[j] !== 0) {
        removeTag[j] = true;
      }
    }

    // replace unbalanced tags
    for (blkIdx = 0; blkIdx < state.tokens.length; blkIdx++) {
      if (state.tokens[blkIdx].type === 'html_block') {
        state.tokens[blkIdx].content = replaceAllUnbalancedTags(state.tokens[blkIdx].content);
        continue;
      }
      if (state.tokens[blkIdx].type !== 'inline') {
        continue;
      }
      inlineTokens = state.tokens[blkIdx].children;
      for (j = 0; j < inlineTokens.length; j++) {
        if (inlineTokens[j].type === 'html_inline') {
          inlineTokens[j].content = replaceAllUnbalancedTags(inlineTokens[j].content);
        }
      }
    }
  }

  md.core.ruler.after('linkify', 'sanitize_inline', sanitizeInlineAndBlock);
  md.core.ruler.after('sanitize_inline', 'sanitize_balance', balance);
};
