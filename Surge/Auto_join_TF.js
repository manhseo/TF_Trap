/*
更新时间：2024.04.11 10:40
更新内容：新增按通知类别保留或延迟消失,模块关闭提示音(SurgeTF参数)

Surge配置
https://raw.githubusercontent.com/githubdulong/Script/master/Surge/AUTOTF.sgmodule
Boxjs订阅
https://raw.githubusercontent.com/githubdulong/Script/master/boxjs.json
*/

if (typeof $request !== 'undefined' && $request) {
    let url = $request.url

    let keyPattern = /^https:\/\/testflight\.apple\.com\/v3\/accounts\/(.*?)\/apps/
    let key = url.match(keyPattern) ? url.match(keyPattern)[1] : null
    const handler = (appIdMatch) => {
        if (appIdMatch && appIdMatch[1]) {
            let appId = appIdMatch[1]
            let existingAppIds = $persistentStore.read('APP_ID')
            let appIdSet = new Set(existingAppIds ? existingAppIds.split(',') : [])
            if (!appIdSet.has(appId)) {
                appIdSet.add(appId)
                $persistentStore.write(Array.from(appIdSet).join(','), 'APP_ID')
                $notification.post('Captured APP_ID', '', `Captured and Stored APP_ID: ${appId}`, {"auto-dismiss": 2})
                console.log(`Captured and Stored APP_ID: ${appId}`)
            } else {
                $notification.post('APP_ID Repeat', '', `APP_ID: ${appId} It already exists, no need to add it again.` , {"auto-dismiss": 2})
                console.log(`APP_ID: ${appId} It already exists, no need to add it again.`)
            }
        } else {
            console.log('No valid TestFlight APP_ID captured')
        }
    }
    if (/^https:\/\/testflight\.apple\.com\/v3\/accounts\/.*\/apps$/.test(url) && key) {
        let headers = Object.fromEntries(Object.entries($request.headers).map(([key, value]) => [key.toLowerCase(), value]))
        let session_id = headers['x-session-id']
        let session_digest = headers['x-session-digest']
        let request_id = headers['x-request-id']

        $persistentStore.write(session_id, 'session_id')
        $persistentStore.write(session_digest, 'session_digest')
        $persistentStore.write(request_id, 'request_id')
        $persistentStore.write(key, 'key')

        let existingAppIds = $persistentStore.read('APP_ID')
        if (!existingAppIds) {
            $notification.post('Get successfully 🎉', '', 'Please obtain the APP_ID and edit the module parameters to disable the script' , {"auto-dismiss": 10})
        }
        console.log(`Get successfully: session_id=${session_id}, session_digest=${session_digest}, request_id=${request_id}, key=${key}`)
    } else if (/^https:\/\/testflight\.apple\.com\/join\/([A-Za-z0-9]+)$/.test(url)) {
        const appIdMatch = url.match(/^https:\/\/testflight\.apple\.com\/join\/([A-Za-z0-9]+)$/)
        handler(appIdMatch)
    } else if (/v3\/accounts\/.*\/ru/.test(url)) {
        const appIdMatch = url.match(/v3\/accounts\/.*\/ru\/(.*)/)
        handler(appIdMatch)
    }

    $done({})
} else {
    !(async () => {
        let ids = $persistentStore.read('APP_ID')
        if (!ids) {
            console.log('APP_ID not detected')
            $done()
        } else {
            ids = ids.split(',')
            for await (const ID of ids) {
                await autoPost(ID, ids)
            }
            if (ids.length === 0) {
                $notification.post('All TestFlights have been added 🎉', '', 'The module has automatically shut down and stopped running', {"sound": true});
                $done($httpAPI('POST', '/v1/modules', {'公测监控': false}));
            } else {
                $done()
            }
        }
    })()
}

async function autoPost(ID, ids) {
    let Key = $persistentStore.read('key')
    let testurl = `https://testflight.apple.com/v3/accounts/${Key}/ru/`
    let header = {
        'X-Session-Id': $persistentStore.read('session_id'),
        'X-Session-Digest': $persistentStore.read('session_digest'),
        'X-Request-Id': $persistentStore.read('request_id')
    }

    return new Promise((resolve) => {
        $httpClient.get({ url: testurl + ID, headers: header }, (error, response, data) => {
            if (error) {
                console.log(`${ID} Network request failed: ${error}，保留 APP_ID`);
                resolve();
                return;
            }

            if (response.status === 500) {
                console.log(`${ID} Server error, status code 500, reserved APP_ID`);
                resolve();
                return
            }

            if (response.status !== 200) {
                console.log(`${ID} Not a valid link: status code ${response.status}，Remove APP_ID`)
                ids.splice(ids.indexOf(ID), 1)
                $persistentStore.write(ids.join(','), 'APP_ID')
                $notification.post('Not a valid TestFlight link', '', `${ID} has been removed` , {"auto-dismiss": 2})
                resolve()
                return
            }

            let jsonData
            try {
                jsonData = JSON.parse(data)
            } catch (parseError) {
                console.log(`${ID} Response parsing failed: ${parseError}，保留 APP_ID`)
                resolve()
                return
            }

            if (!jsonData || !jsonData.data) {
                console.log(`${ID} Unable to accept invitation, 保留 APP_ID`)
                resolve()
                return
            }

            if (jsonData.data.status === 'FULL') {
                console.log(`${ID} Test is full, 保留 APP_ID`)
                resolve()
                return
            }

            $httpClient.post({ url: testurl + ID + '/accept', headers: header }, (error, response, body) => {
                if (!error && response.status === 200) {
                    let jsonBody
                    try {
                        jsonBody = JSON.parse(body)
                    } catch (parseError) {
                        console.log(`${ID} Join request response parsing failed: ${parseError}，保留 APP_ID`)
                        resolve()
                        return
                    }

                    console.log(`${jsonBody.data.name} TestFlight joined successfully`)
                    ids.splice(ids.indexOf(ID), 1)
                    $persistentStore.write(ids.join(','), 'APP_ID')
                    if (ids.length > 0) {
                        $notification.post(jsonBody.data.name + ' TestFlight joined successfully', '', `Continue with APP ID：${ids.join(',')}`, {"sound": true})
                    } else {
                        $notification.post(jsonBody.data.name + ' TestFlight joined successfully', '', 'All APP IDs have been processed', {"sound": true})
                    }
                } else {
                    console.log(`${ID} Failed to join: ${error || `status code ${response.status}`}，保留 APP_ID`)
                }
                resolve()
            })
        })
    })
}
