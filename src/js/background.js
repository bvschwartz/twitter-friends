"use strict"
/* background.js
 *
 * This file has an example of how to make variables accessible to other scripts of the extension.
 *
 * It also shows how to handle short lived messages from other scripts, in this case, from in-content.js
 *
 * Note that not all extensions need of a background.js file, but extensions that need to persist data after a popup has closed may need of it.
 */

var user_map    // <twitter user's id_str> -> name, screen_name
var auth_table  // [ {token, csrf, name, screen_name}

var tabDict = {}
console.log('tabDict:', tabDict)

function now() {
    return Math.floor((new Date()).getTime() / 1000)
}

chrome.storage.local.remove('auth_map')
chrome.storage.local.get(function(result) {
    console.log(result)
})

chrome.storage.local.get(['user_map', 'auth_table'], function(result) {
    user_map = (result && result.user_map) || {}
    auth_table = (result && result.auth_table) || {}
    //user_map = {};
    //auth_table = []
    console.log('user_map:', JSON.stringify(user_map, null, 4))
    console.log('auth_table:', JSON.stringify(auth_table, null, 4))
    checkAuths()
})

function setUser(id_str, name, screen_name) {
    if (!id_str) return
    var user = user_map[id_str]
    if (user && user.name == name && user.screen_name == screen_name) return
    user_map[id_str] = { name: name, screen_name: screen_name, timestamp: now() }
    userMapChanged()
}

function setAuth(token, csrf) {
    var i = auth_table.findIndex(function(item) { return item.token == token })
    var data = (i >= 0) ? auth_table[i] : null
    if (data && data.csrf === csrf) return
    data = data || {}
    data.token = token
    data.csrf = csrf
    data.update = true  // new csrf, needs update
    data.timestamp = now()
    if (i >= 0) {
        auth_table[i] = data
    }
    else {
        auth_table.unshift(data)
    }
    authTableChanged()
}

function authTableChanged(callback) {
    console.log('saving auth_table')
    chrome.storage.local.set({ auth_table: auth_table }, function() {
        console.log('...saved auth_table')
        if (callback) callback()
    })
}

function userMapChanged(callback) {
    console.log('saving user_map')
    chrome.storage.local.set({ user_map: user_map }, function() {
        console.log('...saved user_map')
        if (callback) callback()
    })
}

function checkAuths() {
    for (var data of auth_table) {
        checkAuth(data)
    }
}

function getKeysForUser(id_str) {
    return {
        status: id_str + '_status',
        profile: id_str + '_profile',
        friends: id_str + '_friends',
        history: id_str + '_history',
    }
}

function checkUser(id_str) {
    console.log('checkUser:', id_str)
    if (!id_str) return
    var keys = getKeysForUser(id_str)
    chrome.storage.local.get([keys.status, keys.profile, keys.friends, keys.history], function(result) {
        console.log(result)
        if (!result[keys.friends]) {
            getFriendsForUser(id_str)
        }
    })
}

function getAuthForUser(id_str) {
    for (var data of auth_table) {
        if (data.id_str == id_str) {
            return data
        }
    }
    console.log('did not find', id_str)
}

function getFriendsForUser(id_str, callback) {
    var keys = getKeysForUser(id_str)
    var url = 'https://api.twitter.com/1.1/friends/ids.json?count=5000&stringify_ids=true&user_id=' + id_str
    var name = user_map[id_str].name
    var screen_name = user_map[id_str].screen_name
    var data = getAuthForUser(id_str)
    fetch(url, { headers: {
        'authorization': data.token,
        'x-csrf-token': data.csrf
    }})
    .then(function(response) {
        response.text().then(function(json) {
            var obj = JSON.parse(json)
            obj.ids.sort()
            if (obj.next_cursor > 0) {
               console.warn('there is another page of friend ids!') 
            }
            console.log(screen_name + ' follows ' + obj.ids.length + ' friends')
            var data = {
                ids: obj.ids,
                timestamp: now()
            }
            var save = {}
            save[keys.friends] = data
            chrome.storage.local.set(save, function() {
                console.log('... saved', keys.friends)
                if (callback) callback(null, data)
            })
        
        })
    })
    .catch(function(error) {
        console.log('userFriends failed:', error.message)
        if (callback) callback(error)
    })
}

function checkAuth(data) {
    if (!data) return
    if (!data.csrf) return

    if (data.id_str && !user_map[data.id_str]) {
        setUser(data.id_str, data.name, data.screen_name)
    }

    if (data.fetched && !data.update) {
        checkUser(data.id_str)
        return
    }
    console.log('checking', data)
    const url = 'https://api.twitter.com/1.1/account/verify_credentials.json'
    fetch(url, { headers: {
        'authorization': data.token,
        'x-csrf-token': data.csrf
    }})
    .then(function(response) {
        response.text().then(function(json) {
            var obj = JSON.parse(json)
            console.log('checkAuth response: ', JSON.stringify(obj, null, 4))
            data.id_str = obj.id_str
            data.screen_name = obj.screen_name
            data.name = obj.name
            data.fetched = true
            delete data.update
            var i = auth_table.findIndex(function(item) { return item.token == data.token })
            auth_table[i] = data
            authTableChanged()
            setUser(obj.id_str, obj.name, obj.screen_name )
            checkUser(obj.id_str)
        })
    })
    .catch(function(error) {
        console.log('checkAuth failed:', error.message)
        data.failures = data.failures || 0
        data.failures += 1
        var i = auth_table.findIndex(function(item) { return item.token == data.token })
        auth_table[i] = data
        authTableChanged()
    })

}

function sendPageData(tabId, sendFunc) {
    //console.log('background, send response to tabId: ' +  tabId, tabDict[tabId])
    var i = auth_table.findIndex(function(item) { return item.token == tabDict[tabId].auth })
    var id_str = auth_table[i].id_str
    var user = user_map[id_str]
    var data = {
        id_str: id_str,
        screen_name: user.screen_name,
        name: user.name
    }
    //console.log('sending', data); sendResponse(data); return
    var keys = getKeysForUser(id_str)
    chrome.storage.local.get([keys.status, keys.profile, keys.friends, keys.history], function(result) {
        var friends = result[keys.friends]
        if (friends) {
            data.friend_count = friends.ids.length.toString()
            data.timestamp = friends.timestamp
        }
        console.log('sending', data)
        sendFunc(data)
    })
}

function calcArrayChanges(oldArray, newArray, callback) {
    // both arrays are sorted strings... so we can do this in O(n)
    var adds = []
    var dels = []
    var o = 0
    var n = 0
    console.log('old:', oldArray, 'new:', newArray)
    while (true) {
        var oItem = oldArray[o]
        var nItem = newArray[n]
        if (oItem == nItem) {
            // they match
            //console.log(oItem, ' = ', nItem)
            o++
            n++
        }
        else if (oItem > nItem) {
            // the new item has been added
            //console.log(oItem, ' > ', nItem, 'added new')
            adds.push(nItem)
            n++
        }
        else if (oItem < nItem) {
            //console.log(oItem, ' < ', nItem, 'deleted old')
            dels.push(oItem)
            o++
        }
        else {
            console.log('wut!!!')
            break
        }
        if (o == oldArray.length && n == newArray.length) {
            //console.log('both arrays are finished', o, n)
            break
        }
        if (o == oldArray.length) {
            //console.log('old array is finished... remaining items in new array are adds:', (newArray.length - n))
            while(n < newArray.length) {
                adds.push(newArray[n])
                n++
            }
            break
        }
        if (n == newArray.length) {
            //console.log('new array is finished... remaining items in old array are dels:', (oldArray.length -n))
            while(o < oldArray.length) {
                dels.push(oldArray[o])
                o++
            }
            break
        }
    }
    console.log('additions:', adds, 'deletions:', dels)
    if (callback) callback(adds, dels)
}

function updateHistory(tabId, callback) {
    var i = auth_table.findIndex(function(item) { return item.token == tabDict[tabId].auth })
    var id_str = auth_table[i].id_str
    var keys = getKeysForUser(id_str)
    chrome.storage.local.get([keys.status, keys.profile, keys.friends, keys.history], function(result) {
        var friends = result[keys.friends]
        getFriendsForUser(id_str, function(err, newFriends) {
            calcArrayChanges(friends.ids, newFriends.ids, (adds, dels) => console.log('adds:', adds, 'dels:', dels))
            //console.log(friends, newFriends)
            callback()
        })
    })
}

// Listen to short lived messages from in-content.js
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    console.log('message:', message)
    // Perform any ther actions depending on the message
    //console.log('chrome.runtime.onMessage.addListener: ', message, sender)
    var tabId = message.tabId
    if (!tabDict[tabId]) {
        console.log('background, no response for tabId: ' +  tabId)
        sendResponse(null)
        return
    }

    if (message.cmd == 'update') {
        console.log('update history!')
        updateHistory(tabId, function() {
            sendPageData(tabId, sendResponse)
        })
    }
    else {
        sendPageData(tabId, sendResponse)
    }
    return true
})


// Intercept all requests to twitter.com to look for the
// authorization header
chrome.webRequest.onBeforeSendHeaders.addListener(function(details) {
        if (details.method == 'OPTIONS') return
        //console.log('webRequest.onBeforeSendHeaders **** url: ' + details.url)
        //console.log('webRequest.onBeforeSendHeaders details: ' + JSON.stringify(details, null, 4))
        var tabId = details.tabId
        //console.log('tabId:', tabId)
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
            if (!tabDict[tabId]) {
                tabDict[tabId] = data
                console.log('tab dict:', JSON.stringify(tabDict, null, 4))
            }
        }
    },
    {urls: ['https://api.twitter.com/*']},
    [ 'requestHeaders' ]
)

console.log('loaded background')
