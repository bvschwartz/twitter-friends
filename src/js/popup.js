/* popup.js
 *
 * This file initializes its scripts after the popup has loaded.
 *
 * It shows how to access global variables from background.js.
 * Note that getViews could be used instead to access other scripts.
 *
 * A port to the active tab is open to send messages to its in-content.js script.
 *
 */

import $ from './jquery-3.4.1.min.js'


// Start the popup script, this could be anything from a simple script to a webapp
const initPopupScript = () => {

    // This port enables a long-lived connection to in-content.js
    var tabId = -1

    // Find the current active tab
    function getTab() {
        return new Promise(function(resolve) {
            chrome.tabs.query({
                active: true,
                currentWindow: true
            },
            function(tabs) {
                resolve(tabs[0])
            })
        })
    }

    function renderHtml(data) {
        console.log('render:', data);
        var html
        if (data) {
            $('#history_container').show()
            html = '<b>' + data.name + '</b> @' + data.name
            html += '<br>was following ' + data.friend_count + ' twitter accounts as of<br> ' + (new Date(data.timestamp * 1000))
        }
        else {
            $('#history_container').hide()
            html = 'No data yet... try refreshing page'
        }
        $('#user').html(html)
    }

    $('#update_button').click(function() {
        chrome.runtime.sendMessage({cmd: 'update', tabId: tabId}, renderHtml)
    })

    // Find the current active tab, then send it a message
    getTab().then(function(tab) {
        //console.log('tab:', tab.url)
        tabId = tab.id
        if (!tab.url.startsWith('https://twitter.com')) {
            $('#user').html('Open this extension while on a logged-in www.twitter.com page.')
            return
        }
        chrome.runtime.sendMessage({cmd: 'get_info', tabId: tabId}, renderHtml)

    })
};

// Fire scripts after page has loaded
document.addEventListener('DOMContentLoaded', initPopupScript);
