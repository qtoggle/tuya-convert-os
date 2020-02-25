
const DISCLAIMER_HIDDEN_LOCAL_STORAGE_KEY = 'disclaimer-hidden'
const STATUSES = {
    loading: {
        iconOffset: 2,
        label: 'LOADING...',
        spinIcon: true
    },
    ready: {
        iconOffset: 3,
        label: 'READY',
        spinIcon: false
    },
    converting: {
        iconOffset: 2,
        label: 'CONVERTING',
        spinIcon: true,
    },
    converted: {
        iconOffset: 5,
        label: 'CONVERTED',
        spinIcon: false
    },
    flashing: {
        iconOffset: 2,
        label: 'FLASHING',
        spinIcon: true,
    },
    error: {
        iconOffset: 4,
        label: 'ERROR',
        spinIcon: false
    }
}


/* Local Storage */

function getLocalStorageValue(key, def = null) {
    let value = localStorage.getItem(key)
    if (value == null) {
        return def
    }

    return JSON.parse(value)
}

function setLocalStorageValue(key, value) {
    localStorage.setItem(key, JSON.stringify(value))
}


/* Ajax */

function requestJSON({method, path, query = null, body = null}) {
    return new Promise(function (resolve, reject) {
        let request = new XMLHttpRequest()

        if (query != null) {
            path += '?' + Object.keys(query).map(k => `${k}=${query[k]}`).join('&')
        }

        request.open(method, path, true)

        if (body != null) {
            request.setRequestHeader('Content-Type', 'application/json')
            request.send(JSON.stringify(body))
        }

        request.onload = function () {
            let responseBody = null
            try {
                responseBody = JSON.parse(this.response)
            }
            catch (e) {
            }

            if (request.status >= 200 && request.status < 400) {
                resolve({body: responseBody, status: request.status})
            }
            else {
                reject({body: responseBody, status: request.status})
            }
        }

        request.onerror = function () {
            reject({body: this.response, status: request.status})
        }
    })
}


/* Disclaimer */

class Disclaimer {

    constructor() {
        this.list = document.getElementById('disclaimerList')
        this.button = document.getElementById('toggleDisclaimerButton')

        this.button.addEventListener('click', () => this.toggle())

        if (getLocalStorageValue(DISCLAIMER_HIDDEN_LOCAL_STORAGE_KEY, false) === false) {
            this.show()
        }
        else {
            this.hide()
        }
    }

    show() {
        this.list.classList.add('visible')
        this.button.innerText = 'OK'

        setLocalStorageValue(DISCLAIMER_HIDDEN_LOCAL_STORAGE_KEY, false)
    }

    hide() {
        this.list.classList.remove('visible')
        this.button.innerText = 'Show Instructions'

        setLocalStorageValue(DISCLAIMER_HIDDEN_LOCAL_STORAGE_KEY, true)
    }

    isVisible() {
        return this.list.classList.contains('visible')
    }

    toggle() {
        if (this.isVisible()) {
            this.hide()
        }
        else {
            this.show()
        }
    }

}


/* Status */

function makeDetailDiv({type, message = null, label = null, link = null, callback = null}) {
    let detailDiv = document.createElement('div')
    detailDiv.classList.add('status-detail', `status-${type}`)

    let messageSpan = null
    if (message) {
        messageSpan = document.createElement('span')
        messageSpan.classList.add('status-detail-message')
        messageSpan.innerHTML = message
        detailDiv.appendChild(messageSpan)
    }

    switch (type) {
        case 'text':
            break

        case 'button': {
            let buttonDiv = document.createElement('div')
            buttonDiv.classList.add('button', 'status-detail-button')
            buttonDiv.innerHTML = label
            buttonDiv.addEventListener('click', callback)
            buttonDiv.tabIndex = 0

            detailDiv.appendChild(buttonDiv)
            break
        }

        case 'link': {
            let anchor = document.createElement('a')
            anchor.classList.add('status-detail-link')
            anchor.innerHTML = label
            anchor.href = link

            detailDiv.appendChild(anchor)
            break
        }
    }

    return detailDiv
}

function showStatus(status, details = []) {
    let statusDiv = document.getElementById('statusDiv')
    let iconDiv = document.getElementById('statusIconDiv')
    let labelSpan = document.getElementById('statusLabelSpan')

    let statusInfo = STATUSES[status]
    iconDiv.style.backgroundPositionX = `-${statusInfo.iconOffset * 2}em`
    iconDiv.style.animation = statusInfo.spinIcon ? 'spin 1s linear infinite' : ''
    labelSpan.innerText = statusInfo.label

    statusDiv.classList.remove(...Object.keys(STATUSES))
    statusDiv.classList.add(status)

    if (typeof details === 'string') {
        details = [{type: 'text', message: details}]
    }

    /* Remove existing detail divs */
    [...statusDiv.querySelectorAll('div.status-detail')].map(e => e.remove())

    /* Add new detail divs */
    statusDiv.append(...details.map(makeDetailDiv))
}


/* Firmware */

function showFirmware() {
    document.getElementById('firmwareDiv').classList.add('visible')
}

function hideFirmware() {
    document.getElementById('firmwareDiv').classList.remove('visible')
}

function showFirmwareSource(source) {
    document.querySelectorAll('div.firmware-source').forEach(d => d.classList.remove('visible'))

    switch (source) {
        case 'url':
            document.getElementById('firmwareSourceURLDiv').classList.add('visible')
            break

        case 'upload':
            document.getElementById('firmwareSourceUploadDiv').classList.add('visible')
            break
    }
}

function showFirmwareDetails(errorMessage, size) {
    let statusIconDiv = document.getElementById('firmwareStatusIconDiv')
    let statusMessageSpan = document.getElementById('firmwareStatusMessageSpan')
    let sizeSpan = document.getElementById('firmwareSizeSpan')

    if (errorMessage) {
        statusIconDiv.classList.add('error')
        statusMessageSpan.innerHTML = errorMessage
    }
    else {
        statusIconDiv.classList.remove('error')
        statusMessageSpan.innerHTML = ''
    }

    sizeSpan.innerText = `${size} bytes`

    document.getElementById('firmwareDetailsDiv').classList.add('visible')
}

function hideFirmwareDetails() {
    document.getElementById('firmwareDetailsDiv').classList.remove('visible')
}

function showPointOfNoReturn() {
    document.getElementById('pointOfNoReturnDiv').classList.add('visible')
}

function hidePointOfNoReturn() {
    document.getElementById('pointOfNoReturnDiv').classList.remove('visible')
}


/* Main stuff */

function init() {
    new Disclaimer()

    //showStatus('loading')

    //showStatus('ready', [
    //    {type: 'message', message: 'Make sure your device is powered and in pairing mode.'},
    //    {type: 'button', label: 'Convert'},
    //])

    showStatus('converted', [
        {type: 'message', message: 'Your device has been successfully converted.'},
        {type: 'message', message: 'Flash frequency: <b>80MHz</b>'},
        {type: 'message', message: 'Flash mode: <b>QIO</b>'},
        {type: 'message', message: 'Flash size: <b>4MB</b>'},
        {type: 'link', message: 'Download original firmware:', label: 'original.bin'},
        {type: 'button', label: 'Flash Firmware'},
        {type: 'button', label: 'Convert Another One'}
    ])

    //showStatus('error', 'Could not communicate with Tuya Convert OS server')

    //showStatus('error', [
    //    {type: 'message', message: 'Timeout waiting for device conversion.'},
    //    {type: 'message', message: 'Make sure your device is powered and in pairing mode.'},
    //    {type: 'button', label: 'Retry'},
    //])

    //showStatus('converting', [
    //    {type: 'message', message: 'Please wait while your device is converted...'},
    //    {type: 'button', label: 'Cancel'},
    //])

    //showStatus('flashing', 'Please wait while your device is being flashed...')

    //showStatus('error', [
    //    {type: 'message', message: 'Timeout waiting for device flashing.'},
    //    {type: 'message', message: 'Make sure your device is powered and in pairing mode.'},
    //    {type: 'button', label: 'Retry'}
    //    {type: 'button', label: 'Convert Another One'}
    //])

    //showStatus('ready', [
    //    {type: 'message', message: 'Your device has been successfully flashed.'},
    //    {type: 'button', label: 'Convert Another One'},
    //])
}

if (document.readyState !== 'loading') {
    init()
}
else {
    document.addEventListener('DOMContentLoaded', init)
}
