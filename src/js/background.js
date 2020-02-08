"use strict"
/* background.js
 *
 * This file has an example of how to make variables accessible to other scripts of the extension.
 *
 * It also shows how to handle short lived messages from other scripts, in this case, from in-content.js
 *
 * Note that not all extensions need of a background.js file, but extensions that need to persist data after a popup has closed may need of it.
 */

var verbose = false

chrome.storage.local.getBytesInUse(null, function(bytes) {
    console.log('chrome.storage.local:', bytes, 'bytes in use')
})

var user_map    // <twitter user's id_str> -> name, screen_name
var auth_table  // [ {token, csrf, name, screen_name}
var user_data_cache

var tabDict = {}
verbose && console.log('tabDict:', tabDict)

function now() {
    return Math.floor((new Date()).getTime() / 1000)
}

chrome.storage.local.remove('auth_map')
//chrome.storage.local.get(function(result) { console.log('all of local storage:', result) })

chrome.storage.local.get(['user_map', 'auth_table'], function(result) {
    user_map = (result && result.user_map) || {}
    auth_table = (result && result.auth_table) || []
    //user_map = {};
    auth_table = []
    console.log('user_map:', user_map)
    console.log('auth_table:', auth_table)
    //checkAuths()
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

function checkAuthToken(token, force) {
    for (var data of auth_table) {
        if (data.token == token) {
            verbose && console.log('checkAuthToken: ', token)
            if (force) {
                console.log('force verify')
                data.update = true
            }
            checkAuth(data, force)
        }
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

function getUserData(id_str, callback) {
    if (user_data_cache && user_data_cache.id_str == id_str) {
        verbose && console.log('getUserData:', 'using cache')
        callback(user_data_cache.userData)
        return
    }
    console.log('getUserData:', 'get from storage')
    var keys = getKeysForUser(id_str)
    chrome.storage.local.get([keys.status, keys.profile, keys.friends, keys.history], function(response) {
        console.log('getUserData got:', response)
        var userData = {
            status: response[keys.status],
            profile: response[keys.profile],
            friends: response[keys.friends],
            history: response[keys.history],
        }
        user_data_cache = {
            id_str: id_str,
            userData: userData
        }
        callback(userData)
    })
}

function putUserData(id_str, data, callback) {
    var userData = {}
    var keys = getKeysForUser(id_str)
    if (data.status) { userData[keys.status] = data.status }
    if (data.profile) { userData[keys.profile] = data.profile }
    if (data.friends) { userData[keys.friends] = data.friends }
    if (data.history) { userData[keys.history] = data.history }
    chrome.storage.local.set(userData, function() {
        user_data_cache = null
        getUserData(id_str, callback)
    })
}

// make sure that we've fetched the user's friends the first time
// also make sure that we've gotten their history the first time
var checkingUser = false
function checkUser(id_str) {
    if (checkingUser) {
        console.log('checkUser: already checking')
        return
    }
    checkingUser = true

    verbose && console.log('checkUser:', id_str)
    getUserData(id_str, function(userData) {
        verbose && console.log('userData:', userData)
        if (!userData.friends) {
            getFriendsForUser(id_str, userData)
        }
        checkHistory(id_str, userData)
        checkingUser = false
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

function getFriendsForUser(id_str, userData, callback) {
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
            var data = {}
            data.friends = {
                ids: obj.ids,
                timestamp: now()
            }
            //delete userData.history // for debugging
            if (!userData.history) {
                console.log('needs to add the first history item')
                data.history = [{
                    friend_count: obj.ids.length,
                    adds: [],
                    dels: [],
                    timestamp: now()
                }]
                userData.history = data.history
            }

            // this is a little dangerous because we haven't yet done the diff between old and new history
            putUserData(id_str, data, function() {
                console.log('... saved friends & history', data)
                if (callback) callback(null, data.friends)
            })
        
        })
    })
    .catch(function(error) {
        console.log('userFriends failed:', error.message)
        if (callback) callback(error)
    })
}

var checkingAuth = false
function checkAuth(data) {
    verbose && console.log('checkAuth:', data)
    if (!data) return
    if (!data.csrf) return

    if (data.id_str && !user_map[data.id_str]) {
        setUser(data.id_str, data.name, data.screen_name)
    }

    if (data.fetched && !data.update) {
        checkUser(data.id_str)
        return
    }

    if (checkingAuth) {
        console.log('already checking auth')
        return
    }
    checkingAuth = true
    
    console.log('checkAuth: verify_credentials')
    const url = 'https://api.twitter.com/1.1/account/verify_credentials.json'
    fetch(url, { headers: {
        'authorization': data.token,
        'x-csrf-token': data.csrf
    }})
    .then(function(response) {
        response.text().then(function(json) {
            var obj = JSON.parse(json)
            console.log('verify_credentals:', obj)
            data.id_str = obj.id_str
            data.screen_name = obj.screen_name
            data.name = obj.name
            data.fetched = true
            delete data.update
            var i = auth_table.findIndex(function(item) { return item.token == data.token })
            auth_table[i] = data
            authTableChanged()
            setUser(obj.id_str, obj.name, obj.screen_name)
            checkUser(obj.id_str)
            checkingAuth = false
        })
    })
    .catch(function(error) {
        console.log('verify_credentials failed:', error.message)
        data.failures = data.failures || 0
        data.failures += 1
        var i = auth_table.findIndex(function(item) { return item.token == data.token })
        auth_table[i] = data
        authTableChanged()
        checkingAuth = false
    })

}

function sendPageData(id_str, userData, sendFunc) {
    //console.log('background, send response to tabId: ' +  tabId, tabDict[tabId])
    var user = user_map[id_str]
    var data = {
        id_str: id_str,
        screen_name: user.screen_name,
        name: user.name
    }
    //console.log('sending', data); sendResponse(data); return
    var friends = userData.friends
    if (friends) {
        data.friends = []
        for (var id of userData.friends.ids) {
            var map = user_map[id]
            if (map) {
                data.friends.push(map.screen_name)
            }
            else {
                data.friendds.push(id)
            }
        }
        data.friend_count = friends.ids.length.toString()
        data.timestamp = friends.timestamp
    }
    if (userData.history) {
        data.history = JSON.parse(JSON.stringify(userData.history))

        for (var item of data.history) {
            item.dels = item.dels.map(mapIdStr)
            item.adds = item.adds.map(mapIdStr)
        }
    }
    console.log('sending', data)
    sendFunc(data)

    function mapIdStr(s) {
        var data = { id_str: s }
        var map = user_map[s]
        if (map) {
            data.name = map.name
            data.screen_name = map.screen_name
        }
        return data
    }
}

function calcArrayChanges(oldArray, newArray, callback) {
    // both arrays are sorted strings... so we can do this in O(n)
    var adds = []
    var dels = []
    var o = 0
    var n = 0
    //console.log('old:', oldArray, 'new:', newArray)
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

function updateHistory(id_str, userData, callback) {
    var friends = userData.friends
    getFriendsForUser(id_str, userData, function(err, newFriends) {
        if (!(friends && newFriends)) {
            console.log('friends:', friends, 'newFriends:', newFriends)
        }
        calcArrayChanges(friends.ids, newFriends.ids, (adds, dels) => {
            console.log('adds:', adds, 'dels:', dels)
            var history = userData.history
            console.log('history before:', history)
            if (history.length > 1 &&
                adds.length == 0 &&
                dels.length == 0 &&
                history[0].adds.length == 0 &&
                history[0].dels.length == 0) {
                // just update the top entry
                console.log('updateHistory: adjust timestamp of top item')
                history[0].timestamp = now()
            }
            else {
                console.log('updateHistory: push a new item')
                history.unshift({
                    friend_count: newFriends.ids.length,
                    adds: adds,
                    dels: dels,
                    timestamp: now()
                })
            }
            putUserData(id_str, { history: history }, function() {
                checkHistory(id_str, userData, function() {
                    if (callback) callback(userData)
                })
            })
        })
    })
}

// look for add/del that don't have user_table entries
function checkHistory(id_str, userData, callback) {
    if (!userData.history) return
    var history = userData.history || []
    var missing = []

    function addMissing(list) {
        for (var s of list) {
            if (!user_map[s]) {
                missing.push(s)
            }
        }
    }

    for (var item of userData.history) {
        addMissing(item.adds)
        addMissing(item.dels)
    }
    //console.log('addMissing friends:', userData.friends.ids)
    addMissing(userData.friends.ids)
    if (missing.length == 0) {
        console.log('checkHistory: no missing names')
        if (callback) callback()
        return
    }

    console.log('checkHistory: lookupFriends for ' + id_str)
    lookupFriends(id_str, missing, callback)
}

function lookupFriends(id_str, friends, callback) {
    var name = user_map[id_str].name
    var screen_name = user_map[id_str].screen_name
    var data = getAuthForUser(id_str)
    var url = 'https://api.twitter.com/1.1/users/lookup.json?user_id='
    url += friends.slice(0, 100).join(',')
    //console.log(url)

    fetch(url, { headers: {
        'authorization': data.token,
        'x-csrf-token': data.csrf
    }})
    .then(function(response) {
        response.text().then(function(json) {
            var list = JSON.parse(json)
            if (list.errors) {
                if (list.errors[0].code == 17) {
                    // ""No user matches for specified terms."
                    console.log(list.errors[0].message)
                    for (var friend of friends) {
                        user_map[friend] = { error: 'unknown' }
                    }
                    userMapChanged()
                }
                if (callback) callback()
                return
            }
            console.log(list)
            var timestamp = now()
            for (var item of list) {
                user_map[item.id_str] = { name: item.name, screen_name: item.screen_name, timestamp: timestamp }
                console.log(user_map[id_str])
                //setUser(item.id_str, item.name, item.screen_name)
            }
            userMapChanged()
            if (callback) callback()
        })
    })
    .catch(function(error) {
        console.log('lookup failed:', error.message)
        if (callback) callback(error)
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

    var i = auth_table.findIndex(function(item) { return item.token == tabDict[tabId].auth })
    var id_str = auth_table[i].id_str
    getUserData(id_str, function(userData) {
        if (message.cmd == 'update') {
            console.log('update history!')
            updateHistory(id_str, userData, function(newData) {
                sendPageData(id_str, newData, sendResponse)
            })
        }
        else {
            console.log('unknown cmd:', message.cmd)
        }
    })

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
            verbose && console.log('webRequest.onBeforeSendHeaders:', data.auth, data.csrf, details.url)

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

            var force = (details.url.indexOf('home.json') >= 0)
            checkAuthToken(data.auth, force)
        }
    },
    {urls: ['https://api.twitter.com/*']},
    [ 'requestHeaders' ]
)

console.log('loaded background')
