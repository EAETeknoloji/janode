## About Janode

Janode is a Node.js, browser compatible, adapter for the [Janus WebRTC server](https://github.com/meetecho/janus-gateway).

Internally uses WebSockets or Unix DGRAM Sockets to connect to Janus.

The library wraps the Janus core API, the Janus Admin API and some of the most popular plugins APIs.

The supported Janus plugins currently are:

- SipPlugin

## Example of usage

This is just a pretty simple hello world for the sip plugin.


```js
import Janode from 'janode';
const { Logger } = Janode;
import SipHandle from 'janode/plugins/sip';

const { connect } = Janode;
const { EVENT } = SipHandle;

// top-level await is supported with ES2022
const connection = await connect({
  is_admin: false,
  address: {
    url: 'ws://192.168.0.100:8188/',
  }
});

// Not all of the events are implemented, check for more.
connection.on(Janode.EVENT.CONNECTION_CLOSED, () => {
  console.log('connection is closed');
});

connection.on(Janode.EVENT.CONNECTION_ERROR, () => {
  console.log('connection is errored');
});


const session = await connection.create();

const sipHandle = await session.attach(SipHandle);

const prettyPrint = (evt) => {
  console.log(`********************** ${evt.event} --> START **********************`);
  console.log({ ...evt, date: Date() });
  console.log(`********************** ${evt.event} --> END **********************`);
};

// Janode exports "EVENT" property with core events
sipHandle.on(EVENT.SIP_REGISTERED, prettyPrint);
sipHandle.on(EVENT.SIP_UNREGISTERED, prettyPrint);
sipHandle.on(EVENT.SIP_INCOMINGCALL, (evt) => {
  // handle incoming call event
});
sipHandle.on(EVENT.SIP_HANGUP, prettyPrint);
sipHandle.on(EVENT.SIP_REGISTRATION_FAILED, prettyPrint);

// Refer to plugin documentation
const sipObject = {
  display_name: '500',
  proxy: 'sip:192.168.0.100:9021',
  secret: 'secret',
  username: 'sip:500@192.168.0.100'
};

sipHandle.register(sipObject).then(r=>{}).catch(e=>{});

// detach the handle

// await sipHandle.detach();
```

## Installation

```bash
npm run build
```
