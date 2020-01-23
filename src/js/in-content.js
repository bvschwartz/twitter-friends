/* in-content.js
*
* This file has an example on how to communicate with other parts of the extension through a long lived connection (port) and also through short lived connections (chrome.runtime.sendMessage).
*
* Note that in this scenario the port is open from the popup, but other extensions may open it from the background page or not even have either background.js or popup.js.
* */

// Extension port to communicate with the popup, also helps detecting when it closes
let port = null;

// Send messages to the open port (Popup)
const sendPortMessage = data => port.postMessage(data);

// Handle incoming popup messages
const popupMessageHandler = message => console.log('in-content.js - message from popup:', message);

// Start scripts after setting up the connection to popup
chrome.extension.onConnect.addListener(popupPort => {
    // Listen for popup messages
    popupPort.onMessage.addListener(popupMessageHandler);
    // Set listener for disconnection (aka. popup closed)
    popupPort.onDisconnect.addListener(() => {
        console.log('in-content.js - disconnected from popup');
    });
    // Make popup port accessible to other methods
    port = popupPort;
    // Perform any logic or set listeners
    sendPortMessage('message from in-content.js');
});

// Response handler for short lived messages
function  handleBackgroundResponse(response) {
    console.log('in-content - Received response:', JSON.stringify(response))
    if (response) {
        do_it(response.auth, response.csrf)
        return
    }
    console.log('waiting for auth')
    setTimeout(function() {
        chrome.runtime.sendMessage('in-content', handleBackgroundResponse)
    }, 250)
}
//chrome.runtime.sendMessage('in-content', handleBackgroundResponse)

function do_it(auth, csrf) {
    
    console.log('following: try_it()')
    var url
    url = 'https://api.twitter.com/1.1/friends/following/list.json?include_profile_interstitial_type=1&include_blocking=1&include_blocked_by=1&include_followed_by=1&include_want_retweets=1&include_mute_edge=1&include_can_dm=1&include_can_media_tag=1&skip_status=1&cursor=-1&user_id=3010607233&count=3&with_total_count=true'
    url = 'https://api.twitter.com/1.1/friends/following/list.json?include_profile_interstitial_type=1&include_blocking=1&include_blocked_by=1&include_followed_by=1&include_want_retweets=1&include_mute_edge=1&include_can_dm=1&include_can_media_tag=1&skip_status=1&cursor=-1&user_id=3010607233&count=3&with_total_count=true'
    url = 'https://api.twitter.com/1.1/followers/list.json?include_profile_interstitial_type=1&include_blocking=1&include_blocked_by=1&include_followed_by=1&include_want_retweets=1&include_mute_edge=1&include_can_dm=1&include_can_media_tag=1&skip_status=1&cursor=-1&user_id=3010607233&count=20'
    url = 'https://api.twitter.com/1.1/friends/list.json'

    if (true) {
        fetch(url, {
            credentials: 'include',
            headers: {
                'authorization': auth,
                'x-csrf-token': csrf,
                'x-twitter-active-user': 'yes',
                'x-twitter-auth-type': 'OAuth2Session',
            }
        })
        .then(function(response) {
            console.log('response status:', response.status)
            response.text().then(function(data) {
                console.log(data)
            })

        })
        .catch(function(error) {
            console.log('failed to load:', error.message)
        })
    }
    else {
        req.onload = function(e) {
            console.log('event:', e)
            console.log('response:', e.response)
        }
        req.open("GET", url)
        //req.setRequestHeader('origin', 'https://twitter.com')
        req.setRequestHeader('authorization', auth)
        req.setRequestHeader('x-csrf-token', '2c4fa9d3112665efdef6a496bfc142de')
        req.setRequestHeader('x-twitter-active-user', 'yes')
        req.setRequestHeader('x-twitter-auth-type', 'OAuth2Session')
        req.send()
    }
}
