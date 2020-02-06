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

    function timeString(timestamp) {
        return (new Date(timestamp * 1000)).toString().replace(/ GMT.*/, '')
    }

    function renderHtml(data) {
        console.log('render:', data);
        var html
        if (!data) {
            $('#history_container').hide()
            html = 'No data yet... try refreshing page'
            $('#user').html(html)
            return
        }

        $('#history_container').show()
        html = '<b>' + data.name + '</b> @' + data.screen_name
        html += '<br>is following ' + data.friend_count + ' twitter accounts'
        $('#user').html(html)

        function itemHtml(item) {
            if (!item.screen_name) { return item.id_str }
            return '<a class="friend" href="https://twitter.com/' + item.screen_name + '" target="_blank">' + item.screen_name + '</a>'
        }

        if (data.history) {
            html = ""
            html += '<h2>Friend History</h2>'
            html += '<ul>'
            for (var i in data.history) {
                var item = data.history[i]
                html += '<li>'
                html += item.friend_count + ' friends'
                if (item.adds.length == 0 && item.dels.length == 0) {
                    if (i == (data.history.length - 1)) {
                        html += ', start of history'
                    }
                    else {
                        html += ', no changes'
                    }
                }
                html += '  (' + timeString(item.timestamp) + ')'
                html += '<br>'
                html += '<span style="color:green">'
                for (var add of item.adds) {
                    html += ' +' + itemHtml(add)
                }
                html += '</span>'
                html += '<span style="color:red">'
                for (var del of item.dels) {
                    console.log(del)
                    html += ' -' + itemHtml(del)
                }
                html += '</span>'
                //if (item.adds.length > 0) { html += ', added ' + item.adds.length }
                //if (item.dels.length > 0) { html += ', deleted ' + item.dels.length }
                html += '</li>'
            }
            html += '</ul>'

            if (data.friends) {
                html += '<br><br>'
                html += '<a download="friends.txt" href="data:application/octet-stream,'
                html += data.friends.join('\n')
                html += '">Download Friend List</a>'
            }
            $('#history').html(html)
        }

    }

    $('#update_button').click(function() {
        chrome.runtime.sendMessage({cmd: 'update', tabId: tabId}, renderHtml)
    })

    // Find the current active tab, then send it a message
    getTab().then(function(tab) {
        //console.log('tab:', tab.url)
        tabId = tab.id
        if (!tab.url.startsWith('https://twitter.com')) {
            $('#history_container').hide()
            $('#user').html('Open this extension while on a logged-in <a href="https://twitter.com" target="_blank">twitter.com</a> page.')
            return
        }
        //chrome.runtime.sendMessage({cmd: 'get_info', tabId: tabId}, renderHtml)
        chrome.runtime.sendMessage({cmd: 'update', tabId: tabId}, renderHtml)

    })
};

// Fire scripts after page has loaded
document.addEventListener('DOMContentLoaded', initPopupScript);
