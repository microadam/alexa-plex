'use strict';

const Alexa = require('alexa-sdk')
const request = require('express-request-sign/make-signed-request')

exports.handler = function(event, context, callback) {
  const baseUrl = process.env.CONTROL_SERVER_URL + '/'
  const apiKey = process.env.API_KEY
  const alexa = Alexa.handler(event, context)

  const RETRY_RESPONSE = 'Sorry, please could you re-phrase that?'

  const handlers = {
    LaunchRequest: function () {
      this.emit(':ask', 'What would you like Plex to do?', RETRY_RESPONSE);
    },
    OnDeckIntent: function () {
      perfomBasicAction('ondeck', null, (error, response) => {
        if (error) return
        if (!response.success) {
          console.log('ERROR getting on deck', response)
          return this.emit(':tell', 'Sorry, this information is currently not available')
        }
        const speech = 'Currently available: ' + response.onDeckItems.join(', ')
        this.emit(':tell', speech)
      })
    },
    IplayerWhatsOnIntent: function () {
      perfomBasicAction('channels', null, (error, response) => {
        if (error) return
        if (!response.success) {
          console.log('ERROR getting channels', response)
          return this.emit(':tell', 'Sorry, this information is currently not available')
        }
        const speech = 'Currently playing: ' + response.channels.join(', ')
        this.emit(':tell', speech)
      })
    },
    Unhandled: function () {
      this.emit(':ask', RETRY_RESPONSE, RETRY_RESPONSE);
    }
  }
  const basicHandlers = [
    { intent: 'AMAZON.PauseIntent', action: 'pause', message: 'OK, pausing' },
    { intent: 'AMAZON.ResumeIntent', action: 'resume', message: 'OK, resuming' },
    { intent: 'AMAZON.StopIntent', action: 'stop', message: 'OK, stopping' },
  ]

  function createHandler(action, message) {
    return function () {
      let client = null
      const slots = this.event.request.intent.slots
      if (slots && slots.zone && slots.zone.value) {
        client = slots.zone.value
      }
      perfomBasicAction(action.toLowerCase(), client, (error, response) => {
        if (error) return
        if (!response.success && response.client) {
          return this.emit(':tell', 'Sorry, there is no client with the name: ' + response.client)
        }
        this.emit(':tell', message)
      })
    }
  }

  basicHandlers.forEach((h) => {
    handlers[h.intent] = createHandler(h.action, h.message)
  })

  handlers.ContinueMediaIntent = continueMediaIntent
  handlers.MovieIntent = movieIntent
  handlers.IplayerChannelIntent = IplayerChannelIntent

  alexa.registerHandlers(handlers)
  alexa.execute()

  function continueMediaIntent() {
    playMedia.call(this, 'continue', 'media')
  }

  function movieIntent() {
    playMedia.call(this, 'movie', 'media')
  }

  function IplayerChannelIntent() {
    playMedia.call(this, 'iPlayer', 'channel')
  }

  function playMedia(action, titleSlotName) {
    let name = null
    let client = null
    const slots = this.event.request.intent.slots
    if (slots && slots.zone && slots.zone.value) {
      client = slots.zone.value
    }
    if (slots && slots[titleSlotName] && slots[titleSlotName].value) {
      name = slots[titleSlotName].value
    }
    performPlayAction.call(this, { name, client, type: action }, (error, response) => {
      if (error) return
      this.emit(':tell', 'Playing ' + response.result.title + ' in the ' + response.result.client)
    })
  }

  function perfomBasicAction(action, clientName, cb) {
    const options = {
      url: baseUrl + action,
      method: 'GET',
      apiKey: apiKey
    }
    if (clientName) {
      options.url += '?client=' + clientName
    }
    request(options, (error, res, body) => {
      if (error) {
        console.log('ERROR when trying to ' + action + ':', error)
        this.emit(':tell', 'Sorry, something went wrong')
        return cb(error)
      }
      body = JSON.parse(body)
      cb(null, body)
    })
  }

  function performPlayAction(data, cb) {
    console.log('Performing Play Action', data)
    const opts = {
      url: baseUrl + 'play',
      body: data,
      json: true,
      apiKey: apiKey,
      method: 'POST'
    }
    request(opts, (error, res, body) => {
      if (error) {
        console.log('ERROR when trying to play:', error)
        this.emit(':tell', 'Sorry, something went wrong')
        return cb(error)
      }
      console.log('Play Action Response', body)
      if (!body.success && body.error) {
        console.log('ERROR when trying to play:', body.error)
        return this.emit(':tell', 'Sorry, something went wrong')
      }
      if (!body.success && body.name) {
        return this.emit(':tell', 'Sorry, could not find ' + body.name)
      }
      if (!body.success && body.client) {
        return this.emit(':tell', 'Sorry, there is no client with the name: ' + body.client)
      }
      cb(null, body)
    })
  }
}