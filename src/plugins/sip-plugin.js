'use strict';

/**
 * This is a simple SIP plugin for Janus, allowing
 * WebRTC peers to register at a SIP server (e.g., Asterisk)
 * and call SIP user agents through a Janus instance
 * (ref. {@link https://janus.conf.meetecho.com/docs/sip.html}).
 * @module sip-plugin
 */

import Handle from '../handle.js';
import get from 'lodash/get.js';

/* The plugin ID exported in the plugin descriptor */
const PLUGIN_ID = 'janus.plugin.sip';

/* These are the events/responses that the Janode plugin will manage. */
/* Not all of them will be implemented. */
/* Some of them will be exported in the plugin descriptor */
const PLUGIN_EVENT = {
  ACCEPTED: 'sip_accepted',
  DECLINING: 'sip_declining',
  DTMF_INFO: 'sip_dtmf_info',
  DTMF_SENT: 'sip_dtmfsent',
  ERROR: 'sip_error',
  GENERIC: 'sip_generic',
  HANGUP: 'sip_hangup',
  HANGINGUP: 'sip_hangingup',
  HOLD: 'sip_hold',
  INCOMING_CALL: 'sip_incomingcall',
  INFO: 'sip_info',
  REGISTERED: 'sip_registered',
  REGISTERING: 'sip_registering',
  REGISTRATION_FAILED: 'sip_registration_failed',
  UNHOLD: 'sip_unhold',
  UNREGISTERED: 'sip_unregistered',
  UNREGISTERING: 'sip_unregistering'
};


/* These are the requests defined for the Janus SIP API */
const REQUEST_ACCEPT = 'accept';
const REQUEST_DECLINE = 'decline';
const REQUEST_REGISTER = 'register';
const REQUEST_UNREGISTER = 'unregister';
const REQUEST_DTMF = 'dtmf_info';


const mapNativeEventsToPluginEvents = (evt) => {
  switch (evt) {
    /* CALL EVENTS */
    case 'incomingcall':
      return PLUGIN_EVENT.INCOMING_CALL;
    case 'accepted':
      return PLUGIN_EVENT.ACCEPTED;
    case 'hangingup':
      return PLUGIN_EVENT.HANGINGUP;
    case 'hangup':
      return PLUGIN_EVENT.HANGUP;
    case 'declining':
      return PLUGIN_EVENT.DECLINING;
    case 'dtmfsent':
      return PLUGIN_EVENT.DTMF_SENT;
    /* REGISTRATION EVENTS */
    case 'registering':
      return PLUGIN_EVENT.REGISTERING;
    case 'registered':
      return PLUGIN_EVENT.REGISTERED;
    case 'unregistering':
      return PLUGIN_EVENT.UNREGISTERING;
    case 'unregistered':
      return PLUGIN_EVENT.UNREGISTERED;
    case 'registration_failed':
      return PLUGIN_EVENT.REGISTRATION_FAILED;
    default:
      return null;
  }
};


/**
 * The class implementing the Sip plugin (ref. {@link https://janus.conf.meetecho.com/docs/sip.html}).<br>
 *
 * It extends the base Janode Handle class and overrides the base "handleMessage" method.<br>
 * 
 * This handle will be attached to an existing session.<br>
 *
 * Moreover it defines some methods to support Sip operations.<br>
 *
 * @hideconstructor
 */
class SipHandle extends Handle {
  /**
   * Create a Janode Sip handle.
   * 
   * @param {module:session~Session} session - A reference to the parent session
   * @param {number} id - The handle identifier
   */
  constructor(session, id) {
    super(session, id);
  }

  /**
   * The custom "handleMessage" needed for handling Sip messages.
   *
   * @private
   * @param {object} janus_message
   * @returns {object} A falsy value for unhandled events, a truthy value for handled events
   */
  handleMessage(janus_message) {
    const { plugindata, jsep, transaction } = janus_message;
    if (plugindata && plugindata.data && plugindata.data.sip) {
      const message_data = plugindata.data;
      /**
       * @description an example of message_data
       *{
       * "sip": "event",
       * "result": {
       *     "event": "incomingcall",
       *     "username": "sip:666@192.200.0.15",
       *     "call_id": "c09b94a5-2613-43f2-99c9-b3f488dc6bd6",
       *     "displayname": "\"666\"",
       *     "callee": "sip:999@192.200.0.15"
       * },
       * "call_id": "c09b94a5-2613-43f2-99c9-b3f488dc6bd6"
       *}
       */
      const { sip, error, error_code, result } = message_data;

      /* Prepare an object for the output Janode event */
      const janode_event = {
        /* The name of the resolved event */
        event: null,
        /* The event payload */
        data: {},
      };

      /* Add JSEP data if available */
      if (jsep) janode_event.data.jsep = jsep;

      /* The plugin will emit an event only if the handle does not own the transaction */
      /* That means that a transaction has already been closed or this is an async event */
      const emit = (this.ownsTransaction(transaction) === false);
      const sip_event = get(result, 'event');
      /* Use the "janode" property to store the output event */
      janus_message._janode = janode_event;
      switch (sip) {
        /* Generic event (e.g. result, error) */
        case 'event':
          /* incomingcall event */
          janode_event.event = mapNativeEventsToPluginEvents(sip_event);
          if (janode_event.event) {
            janode_event.data = { ...janode_event.data, ...result };
            break;
          }
          if (result) {
            /* TO-DO not sure all non-error events are properly handled. Stop-gap solution  */
            janode_event.event = PLUGIN_EVENT.GENERIC;
            janode_event.data.result = result;
            break;
          }
          /* Sip error */
          if (error) {
            janode_event.event = PLUGIN_EVENT.ERROR;
            janode_event.data = new Error(`${error_code} ${error}`);
            /* In case of error, close a transaction */
            this.closeTransactionWithError(transaction, janode_event.data);
            break;
          }
          break;
      }

      /* The event has been handled */
      if (janode_event.event) {
        /* Try to close the transaction */
        this.closeTransactionWithSuccess(transaction, janus_message);
        /* If the transaction was not owned, emit the event */
        if (emit) this.emit(janode_event.event, janode_event.data);
        return janode_event;
      }
    }

    /* The event has not been handled, return a falsy value */
    return null;
  }

  /**
   * Register to a SIP server via Janus SIP Plugin.
   *
   * @param {object} params
   * @param {string} [display_name] - displaying name to register
   * @param {string} [proxy] - sip proxy address
   * @param {string} [secret] - Secret key to register SIP
   * @param {string} [username] - sip username
   * @returns {Promise<module:sip-plugin>}
   */
  async register({ display_name, proxy, secret, username }) {
    const body = {
      display_name, proxy, secret, username, request: REQUEST_REGISTER
    };

    const response = await this.message(body);
    const { event, data: evtdata } = response._janode || {};
    if ([PLUGIN_EVENT.REGISTERING, PLUGIN_EVENT.GENERIC].includes(event))
      return evtdata;
    const error = new Error(`${REQUEST_REGISTER} error-->`, event);
    throw (error);
  }

  /**
   * Unregister sip handle.
   * @returns {Promise<module:sip-plugin>}
   */
  async unregister() {
    const body = {
      request: REQUEST_UNREGISTER
    };

    const response = await this.message(body);
    const { event, data: evtdata } = response._janode || {};
    if ([PLUGIN_EVENT.GENERIC, PLUGIN_EVENT.UNREGISTERING].includes(event))
      return evtdata;
    const error = new Error(`${REQUEST_UNREGISTER} error-->`, event);
    throw (error);
  }

  /**
   * Helper for sending DTMF value.
   * @param {string} value - DTMF value
   * @returns {Promise<module:sip-plugin>}
   */
  async sendDTMF(value) {
    if (typeof value !== 'string') {
      throw new Error('value must be a type of string');
    }
    const body = {
      request: REQUEST_DTMF,
      digit: value
    };
    const response = await this.message(body);
    const { event, data: evtdata } = response._janode || {};
    if ([PLUGIN_EVENT.GENERIC, PLUGIN_EVENT.DTMF_SENT].includes(event))
      return evtdata;
    const error = new Error(`${REQUEST_DTMF} error-->`, event);
    throw (error);
  }

  /**
   * Decline incoming call.
   * @returns {Promise<module:sip-plugin>}
   */
  async decline() {
    const body = {
      request: REQUEST_DECLINE,
    };
    const response = await this.message(body);
    const { event, data: evtdata } = response._janode || {};
    if ([PLUGIN_EVENT.GENERIC, PLUGIN_EVENT.DECLINING].includes(event))
      return evtdata;
    const error = new Error(`${REQUEST_DECLINE} error-->`, event);
    throw (error);
  }

  /**
   * Accept incoming call.
   * @param {string} sdp_answer - Answer Sdp packet
   * @returns {Promise<module:sip-plugin>}
   */
  async accept(sdp_answer) {
    const body = {
      request: REQUEST_ACCEPT,
    };
    let error;
    if (get(sdp_answer, 'type') === 'answer' && get(sdp_answer, 'sdp')) {
      const response = await this.message(body, sdp_answer);
      const { event, data: evtdata } = response._janode || {};
      if (event === PLUGIN_EVENT.ACCEPTED)
        return evtdata;
      error = new Error(`${REQUEST_DECLINE} error-->`, event);
    } else {
      error = new Error(`${REQUEST_ACCEPT} error, SDP answer packet is malformed`);
    }
    throw (error);
  }
}


export default {
  id: PLUGIN_ID,
  Handle: SipHandle,
  EVENT: {
    /**
     * @event module:sip-plugin~SipHandle#event:SIP_ERROR
     * @type {Error}
     */
    SIP_ERROR: PLUGIN_EVENT.ERROR,
    /**
     * @event module:sip-plugin~SipHandle#event:SIP_INCOMING_CALL
     * @type {module:sip-plugin~SIP_INCOMING_CALL}
     */
    SIP_INCOMINGCALL: PLUGIN_EVENT.INCOMING_CALL,
    /**
     * @event module:sip-plugin~SipHandle#event:SIP_REGISTERED
     * @type {module:sip-plugin~SIP_REGISTERED}
     */
    SIP_REGISTERED: PLUGIN_EVENT.REGISTERED,
    /**
     * @event module:sip-plugin~SipHandle#event:SIP_UNREGISTERED
     * @type {module:sip-plugin~SIP_UNREGISTERED}
     */
    SIP_UNREGISTERED: PLUGIN_EVENT.UNREGISTERED,
    /**
     * @event module:sip-plugin~SipHandle#event:SIP_HANGUP
     * @type {module:sip-plugin~SIP_HANGUP}
     */
    SIP_HANGUP: PLUGIN_EVENT.HANGUP,
    /**
     * @event module:sip-plugin~SipHandle#event:SIP_REGISTRATION_FAILED
     * @type {module:sip-plugin~SIP_REGISTRATION_FAILED}
     */
    SIP_REGISTRATION_FAILED: PLUGIN_EVENT.REGISTRATION_FAILED,
  },
};