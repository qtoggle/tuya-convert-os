
const DISCLAIMER_HIDDEN_LOCAL_STORAGE_KEY = 'disclaimer-hidden'


/* Local Storage */

/**
 * @param {String} key
 * @param {*} [def]
 * @returns {*}
 */
function getLocalStorageValue(key, def = null) {
    let value = localStorage.getItem(key)
    if (value == null) {
        return def
    }

    return JSON.parse(value)
}

/**
 * @param {String} key
 * @param {*} value
 */
function setLocalStorageValue(key, value) {
    localStorage.setItem(key, JSON.stringify(value))
}


/* AJAX */

/**
 * @param {String} method
 * @param {String} path
 * @param {Object} [query]
 * @param {*} [body]
 * @returns {Promise}
 */
function requestJSON({method, path, query = null, body = null}) {
    return new Promise(function (resolve, reject) {
        let request = new XMLHttpRequest()

        if (query != null) {
            path += '?' + Object.keys(query).map(k => `${k}=${encodeURIComponent(query[k])}`).join('&')
        }

        request.open(method, path, true)

        if (body != null) {
            request.setRequestHeader('Content-Type', 'application/json')
            request.send(JSON.stringify(body))
        }
        else {
            request.send()
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

/**
 * @param {String} method
 * @param {String} path
 * @param {Object} [query]
 * @param {ArrayBuffer} [body]
 * @param {String} [contentType]
 * @returns {Promise}
 */
function requestBinary({method, path, query = null, body = null, contentType = 'application/octet-stream'}) {
    return new Promise(function (resolve, reject) {
        let request = new XMLHttpRequest()

        if (query != null) {
            path += '?' + Object.keys(query).map(k => `${k}=${encodeURIComponent(query[k])}`).join('&')
        }

        request.open(method, path, true)
        request.responseType = 'arraybuffer'

        if (body != null) {
            request.setRequestHeader('Content-Type', contentType)
            request.send(body)
        }
        else {
            request.send()
        }

        request.onload = function () {
            if (request.status >= 200 && request.status < 400) {
                resolve({body: this.response, status: request.status})
            }
            else {
                reject({body: this.response, status: request.status})
            }
        }

        request.onerror = function () {
            reject({body: this.response, status: request.status})
        }
    })
}


/* API requests */

function apiGetStatus() {
    return requestJSON({method: 'GET', path: '/status'}).then(response => response.body)
}

/**
 *
 * @param {String} stateName
 * @param {Object} [params]
 * @returns {Promise}
 */
function apiPatchStatus(stateName, params = {}) {
    let args = {method: 'PATCH', path: '/status', body: {state: stateName, params: params}}

    return requestJSON(args).catch(function (e) {
        setState('server-communication-error')
        throw e
    })
}

/**
 * @param {String} url
 */
function apiDownloadFirmware(url) {
    return requestBinary({method: 'GET', path: '/firmware/proxy', query: {url}})
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

    /**
     * @returns {Boolean}
     */
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

    static init() {
        new Disclaimer()
    }

}


/* States */

class State {

    iconOffset = 0
    label = ''
    spinIcon = false

    /**
     * @param {Object} params
     * @returns {Object[]}
     */
    makeDetails(params) {
        return []
    }

    onEnter() {
        hideFirmware()
    }

    startConversion() {
        setState('loading', {message: 'Starting conversion...'})

        apiPatchStatus('converting')
    }

    cancelConversion() {
        setState('loading', {message: 'Cancelling...'})

        apiPatchStatus('ready')
    }

    startFlash() {
        setState('loading', {message: 'Starting flashing...'})

        let encodedFirmware = btoa(currentFirmwareContent)
        apiPatchStatus('flashing', {firmware: encodedFirmware})
    }

}

class LoadingState extends State {

    iconOffset = 2
    label = ''
    spinIcon = true

    makeDetails(params) {
        if (params.message) {
            return [
                {type: 'message', message: params.message}
            ]
        }
        else {
            return []
        }
    }

}

class ReadyState extends State {

    iconOffset = 3
    label = 'READY'

    makeDetails(params) {
        return [
            {type: 'message', message: 'Make sure your device is powered and in pairing mode.'},
            {type: 'button', label: 'Convert', callback: () => this.startConversion()},
        ]
    }

}

class ConvertingState extends State {

    iconOffset = 2
    label = 'CONVERTING'
    spinIcon = true

    makeDetails(params) {
        return [
            {type: 'message', message: 'Please wait while your device is converted...'},
            {type: 'button', label: 'Cancel', callback: () => this.cancelConversion()}
        ]
    }

}

class ConvertedState extends State {

    iconOffset = 6
    label = 'CONVERTED'

    makeDetails(params) {
        return [
            {type: 'message', message: 'Your device has been successfully converted.'},
            {type: 'message', message: `Flash frequency: <b>${params['flash_freq']} MHz</b>`},
            {type: 'message', message: `Flash mode: <b>${params['flash_mode']}</b>`},
            {type: 'message', message: `Flash size: <b>${params['flash_size'] / 1024} KB</b>`},
            {
                type: 'link',
                message: 'Download original firmware:',
                label: 'original.bin',
                link: '/firmware/original.bin'
            },
            {type: 'button', label: 'Flash Firmware', callback: showFirmware},
            {type: 'button', label: 'Convert Another Device', callback: () => this.startConversion()}
        ]
    }

}

class ConversionCancelledState extends State {

    iconOffset = 4
    label = 'CANCELLED'

    makeDetails(params) {
        return [
            {type: 'message', message: 'Conversion has been cancelled.'},
            {type: 'button', label: 'Restart Conversion', callback: () => this.startConversion()},
        ]
    }

}

class ConversionErrorState extends State {

    iconOffset = 5
    label = 'ERROR'

    makeDetails(params) {
        return [
            {type: 'message', message: params.message || 'Could not convert device.'},
            {type: 'message', message: 'Make sure your device is powered and in pairing mode.'},
            {type: 'button', label: 'Retry', callback: () => this.startConversion()}
        ]
    }

}

class FlashingState extends State {

    iconOffset = 2
    label = 'FLASHING'
    spinIcon = true

    makeDetails(params) {
        return [
            {type: 'text', message: 'Please wait while your device is being flashed...'}
        ]
    }

}

class FlashedState extends State {

    iconOffset = 3
    label = 'FLASHED'

    makeDetails(params) {
        return [
            {type: 'message', message: 'Your device has been successfully flashed.'},
            {type: 'button', label: 'Convert Another Device', callback: () => this.startConversion()},
        ]
    }

}

class FlashingErrorState extends State {

    iconOffset = 5
    label = 'ERROR'

    makeDetails(params) {
        return [
            {type: 'message', message: params.message || 'Could not flash device.'},
            {type: 'button', label: 'Retry', callback: () => this.startFlash()},
            {type: 'button', label: 'Convert Another Device', callback: () => this.startConversion()}
        ]
    }

}

class ServerCommunicationErrorState extends State {

    iconOffset = 5
    label = 'ERROR'

    makeDetails(params) {
        return [
            {type: 'text', message: 'Could not communicate with Tuya Convert OS server'}
        ]
    }

}


const STATES = {
    'loading': new LoadingState(),
    'ready': new ReadyState(),
    'converting': new ConvertingState(),
    'converted': new ConvertedState(),
    'conversion-cancelled': new ConversionCancelledState(),
    'conversion-error': new ConversionErrorState(),
    'flashing': new FlashingState(),
    'flashed': new FlashedState(),
    'flashing-error': new FlashingErrorState(),
    'server-communication-error': new ServerCommunicationErrorState()
}

let currentState = ReadyState
let currentStateParams = {}


/**
 * @param {String} stateName
 * @param {Object} params
 */
function setState(stateName, params = {}) {
    let newState = STATES[stateName]
    if (newState === currentState && currentStateParams === params) {
        return
    }

    currentState = newState
    currentStateParams = params

    /* Show current status */
    showStatus(currentState, currentState.makeDetails(params))

    /* Call the state enter callback */
    currentState.onEnter()
}


/* Status */

/**
 * @param {String} type
 * @param {String} [message]
 * @param {String} [label]
 * @param {String} [link]
 * @param {Function} [callback]
 * @returns {HTMLElement}
 */
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

/**
 * @param {State} state
 * @param {Object[]} details
 */
function showStatus(state, details) {
    let statusDiv = document.getElementById('statusDiv')
    let iconDiv = document.getElementById('statusIconDiv')
    let labelSpan = document.getElementById('statusLabelSpan')

    iconDiv.style.backgroundPositionX = `-${state.iconOffset * 2}em`
    iconDiv.style.animation = state.spinIcon ? 'spin 1s linear infinite' : ''
    labelSpan.innerText = state.label;

    /* Remove existing detail divs */
   [...statusDiv.querySelectorAll('div.status-detail')].map(e => e.remove())

    /* Add new detail divs */
    statusDiv.append(...details.map(makeDetailDiv))
}

function initStatus() {
    setState('loading', {message: 'Loading...'})

    setInterval(function () {
        apiGetStatus().then(function (status) {
            setState(status.state, status.params)
        })
    }, 1000)
}


/* Firmware */

let currentFirmwareContent = null


function initFirmware() {
    let firmwareSourceURLRadio = document.getElementById('firmwareSourceURLRadio')
    let firmwareSourceUploadRadio = document.getElementById('firmwareSourceUploadRadio')
    let firmwareURLGetButton = document.getElementById('firmwareURLGetButton')
    let firmwareURLTextInput = document.getElementById('firmwareURLTextInput')
    let firmwareUploadFileInput = document.getElementById('firmwareUploadFileInput')
    let startFlashButton = document.getElementById('startFlashButton')

    function handleFirmwareSourceChange() {
        if (firmwareSourceURLRadio.checked) {
            showFirmwareSource('url')
        }
        else {
            showFirmwareSource('upload')
        }

        hideFirmwareDetails()
        hidePointOfNoReturn()
    }

    firmwareSourceURLRadio.addEventListener('change', handleFirmwareSourceChange)
    firmwareSourceUploadRadio.addEventListener('change', handleFirmwareSourceChange)

    firmwareURLGetButton.addEventListener('click', function () {
        hidePointOfNoReturn()

        if (!firmwareURLTextInput.value || !firmwareURLTextInput.value.startsWith('http')) {
            showFirmwareDetails({message: 'Please enter a valid URL', valid: false})
            return
        }

        showFirmwareDetails({message: 'Checking firmware...', progress: true})

        /* Try to download file at indicated URL */
        apiDownloadFirmware(firmwareURLTextInput.value).then(function (response) {

            let result = validateFirmware(response.body)
            showFirmwareDetails(result)

            if (result.valid) {
                showPointOfNoReturn(response.body)
            }

        }).catch(function () {
            showFirmwareDetails({message: 'Could not download file at given URL', valid: false})
        })
    })

    firmwareUploadFileInput.addEventListener('change', function () {
        hidePointOfNoReturn()
        hideFirmwareDetails()

        if (this.files.length) {
            let file = this.files[0]

            let reader = new FileReader()
            reader.onload = function (e) {
                let result = validateFirmware(e.target.result)
                showFirmwareDetails(result)

                if (result.valid) {
                    showPointOfNoReturn(e.target.result)
                }
            }

            reader.readAsArrayBuffer(file)
        }
    })

    startFlashButton.addEventListener('click', function () {
        currentState.startFlash()
    })
}

function showFirmware() {
    document.getElementById('firmwareDiv').classList.add('visible')
}

function hideFirmware() {
    document.getElementById('firmwareDiv').classList.remove('visible')
    document.getElementById('firmwareURLTextInput').value = ''

    hideFirmwareDetails()
    hidePointOfNoReturn()
}

/**
 * @param {String} source
 */
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

/**
 * @param {?String} message
 * @param {Boolean} [valid]
 * @param {?Number} [size]
 * @param {Boolean} [progress]
 */
function showFirmwareDetails({message, valid = true, size = null, progress = false}) {
    let statusIconDiv = document.getElementById('firmwareStatusIconDiv')
    let statusMessageSpan = document.getElementById('firmwareStatusMessageSpan')
    let sizeSpan = document.getElementById('firmwareSizeSpan')

    statusIconDiv.classList.toggle('error', !valid)
    statusIconDiv.classList.toggle('progress', progress)
    statusMessageSpan.innerHTML = message

    if (size) {
        sizeSpan.innerText = `${size} bytes`
    }
    else {
        sizeSpan.innerText = ''
    }

    document.getElementById('firmwareDetailsDiv').classList.add('visible')
}

function hideFirmwareDetails() {
    document.getElementById('firmwareDetailsDiv').classList.remove('visible')
}

/**
 * @param {ArrayBuffer} firmwareContent
 */
function showPointOfNoReturn(firmwareContent) {
    document.getElementById('pointOfNoReturnDiv').classList.add('visible')

    currentFirmwareContent = firmwareContent
}

function hidePointOfNoReturn() {
    document.getElementById('pointOfNoReturnDiv').classList.remove('visible')

    currentFirmwareContent = null
}

/**
 * @param {ArrayBuffer} content
 * @returns {Object}
 */
function validateFirmware(content) {
    let valid = true
    let message = 'firmware is valid'

    if (content.byteLength < 1024) {
        valid = false
        message = 'firmware must have at least 1KB'
    }
    else if (content.byteLength > 512 * 1024) {
        valid = false
        message = 'firmware must not exceed 512KB'
    }

    return {
        valid: valid,
        message: message,
        size: content.byteLength
    }
}


/* Main stuff */

function init() {
    Disclaimer.init()
    initFirmware()
    initStatus()
}

if (document.readyState !== 'loading') {
    init()
}
else {
    document.addEventListener('DOMContentLoaded', init)
}
