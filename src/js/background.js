"use strict"
/* background.js
 *
 * This file has an example of how to make variables accessible to other scripts of the extension.
 *
 * It also shows how to handle short lived messages from other scripts, in this case, from in-content.js
 *
 * Note that not all extensions need of a background.js file, but extensions that need to persist data after a popup has closed may need of it.
 */

var user_map 
var auth_map 
var tabDict = {}

function now() {
    return Math.floor((new Date()).getTime() / 1000)
}

chrome.storage.local.get('user_map', function(map) {
    user_map = (map && map.user_map) || {}
    console.log('user_map:', JSON.stringify(user_map, null, 4))
})

chrome.storage.local.get('auth_map', function(map) {
    auth_map = (map && map.auth_map) || {}
    console.log('auth_map:', JSON.stringify(auth_map, null, 4))
    checkAuths()
})

function setUser(id_str, name, screen_name) {
    user_map[id_str] = { name: name, screen_name: screen_name }
    userMapChanged()
}

function setAuth(auth, csrf) {
    var data = auth_map[auth]
    if (data && data.csrf === csrf) return
    data = data || {}
    data.timestamp = now()
    data.csrf = csrf
    data.update = true  // new csrf, needs update
    auth_map[auth] = data
    authMapChanged()
}

function authMapChanged() {
    console.log('saving auth_map')
    chrome.storage.local.set({ auth_map: auth_map }, function() {
        console.log('...saved auth_map')
    })
}

function userMapChanged() {
    console.log('saving user_map')
    chrome.storage.local.set({ user_map: user_map }, function() {
        console.log('...saved user_map')
    })
}

function checkAuths() {
    for (var auth in auth_map) {
        checkAuth(auth)
    }
}

function checkAuth(auth) {
    var data = auth_map[auth]
    if (!data) return
    if (!data.csrf) return

    if (data.id_str && !user_map[data.id_str]) {
        setUser(data.id_str, data.name, data.screen_name)
    }

    if (data.fetched && !data.update) return
    console.log('checking', auth)
    const url = 'https://api.twitter.com/1.1/account/verify_credentials.json'
    fetch(url, { headers: {
        'authorization': auth,
        'x-csrf-token': data.csrf
    }})
    .then(function(response) {
        response.text().then(function(json) {
            var obj = JSON.parse(json)
            console.log('checkAuth response: ', JSON.stringify(obj, null, 4))
            data.screen_name = obj.screen_name
            data.id_str = obj.id_str
            data.name = obj.name
            data.fetched = true
            auth_map[auth] = data
            authMapChanged()
            setUser(obj.id_str, { name: obj.name, screen_name: obj.screen_name} )
        })
    })
    .catch(function(error) {
        console.log('checkAuth failed:', error.message)
        data.failures = data.failures || 0
        data.failures += 1
        auth_map[auth] = data
        authMapChanged()
    })

}

// Listen to short lived messages from in-content.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Perform any ther actions depending on the message
    // Respond message
    var tabId = sender.tab.id
    if (!tabDict[tabId]) {
        console.log('background, no response for tabId: ' +  tabId)
        sendResponse(null)
        return
    }

    console.log('background, send response to tabId: ' +  tabId, tabDict[tabId])
    sendResponse(tabDict[tabId])
})


// Intercept all requests to twitter.com to look for the
// authorization header
chrome.webRequest.onBeforeSendHeaders.addListener(function(details) {
        if (details.method == 'OPTIONS') return
        console.log('webRequest.onBeforeSendHeaders **** url: ' + details.url)
        //console.log('webRequest.onBeforeSendHeaders details: ' + JSON.stringify(details, null, 4))
        var tabId = details.tabId
        if (tabId === -1) return
        var data = { }
        for (var header of details.requestHeaders) {
            if (header.name == 'authorization') {
                data.auth = header.value
            }
            if (header.name == 'x-csrf-token') {
                data.csrf = header.value
            }
        }
        if (data.auth && data.csrf) {

            setAuth(data.auth, data.csrf)

            data = Object.assign(data, {
                tabId: tabId,
                timeStamp: now(),
                url: details.url,
            })
            tabDict[tabId] = data
            //console.log('tab dict:', JSON.stringify(tabDict, null, 4))
        }
    },
    {urls: ['https://api.twitter.com/*']},
    [ 'requestHeaders' ]
)

function try_it() {
    var url
    url = 'https://api.twitter.com/1.1/friends/list.json?skip_status=1&user_id=3010607233'
    url = 'https://api.twitter.com/1.1/friends/list.json?skip_status=1'
    url = 'https://api.twitter.com/1.1/friends/ids.json'
    url = 'https://api.twitter.com/2/badge_count/badge_count.json?supports_ntab_urt=1'
    url = 'https://api.twitter.com/1.1/account/verify_credentials.json'
    fetch(url, { headers: {
        'authorization': 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
        //'x-csrf-token': '2c4fa9d3112665efdef6a496bfc142de'
        //'x-csrf-token': '11d1c6ae07b4599a6e0263ef19d6ba5d'
        //'x-csrf-token': '0082370c868eb5f5f466ed8c144aecc1'
        'x-csrf-token': '0082370c868eb5f5f466ed8c144aecc1'
    }})
    .then(function(response) {
        console.log('response status:', response.status)
        response.text().then(function(data) {
            //console.log(JSON.stringify(JSON.parse(data), null, 4))
            console.log(JSON.stringify(JSON.parse(data)))
        })
    })
    .catch(function(error) {
        console.log('failed to load:', error.message)
    })
}
//try_it()
console.log('loaded background')
