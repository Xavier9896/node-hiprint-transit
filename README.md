<a name="readme-top"></a>

# node-hiprint-transit

`node-hiprint-transit` is a Node.js-based transit server that acts as a bridge between the `electron-hiprint` client and the `vue-plugin-hiprint` library, enabling seamless connectivity and printing operations between these components.

[中文](README.md)

![node-hiprint-transit_cn.png](./res/node-hiprint-transit_en.png)

## Features

- **Remote Printing**: Easily print documents from the client to the printer using `electron-hiprint` without any dialog prompts.

- **Secure Connection**: All connections between the client, transit server, and `vue-plugin-hiprint` library are protected with tokens and ports.

- **Configuration**: `node-hiprint-transit` allows you to configure various settings including port, token, SSL usage, and language preferences.

- **Ease of Use**: `node-hiprint-transit` is typically installed on a public server with a relatively fixed IP and port. It can also be accessed via a domain name. Only one-time configuration is required in `electron-hiprint` and `vue-plugin-hiprint`, unlike `electron-hiprint` which is susceptible to DHCP automatic address changes.

## Free Services - Powered by Love

| Version | Server Info | Service Provider | Region | Expiry Date | Server Address | Token |
| --- | --- | --- | --- | --- | --- | --- |
| 0.0.4 | 2C2G4M 300G/m | Tencent Cloud | GZ | 2026-07-16 | https://v4.printjs.cn:17521 | hiprint* |
| 0.0.4 | 2C2G3M | Aliyun | GZ | 2024-11-8 | https://v4-b.printjs.cn:17521 | hiprint* |
| 0.0.3 | 1C1G3M 1000G/m | Yisu Cloud | HK | 2025-07-17 | https://printjs.cn:17521 | vue-plugin-hiprint |

The above services are freely available. Version 0.0.3 does not have token isolation and is only recommended for development and testing purposes.

This project is free and open source. We promise not to steal any data generated during the use of the above free services. However, we cannot guarantee that the services will not be vulnerable to data leakage due to hacker attacks.

If you require higher stability, security, and reliability for your services, we recommend deploying them independently. Teams with backend development capabilities can rewrite the services using their preferred backend language.

> !!! ⚠️ When using the web interface, please connect and disconnect as needed. Do not keep the connection to the service for an extended period of time to reduce server load.

> !!! ⚠️ Please do not use weak passwords, such as "hiprint-123". This project is not responsible for any issues caused by the use of weak passwords.

> **! I am a frontend developer and have limited knowledge of servers, operations, and security. I kindly request that you refrain from attacking the free and open source services.**


## Scripts

This script will help you quickly install, initialize, and run `node-hiprint-transit`.

```bash
wget https://raw.githubusercontent.com/Xavier9896/node-hiprint-transit/main/install.sh

chmod +x install.sh

./install.sh
```

## Initialization

When using it for the first time, you need to perform the initial setup.

This will guide you through the initialization step by step.

```bash
node run ./dist/init

# ? Set language (Use arrow keys)
# > English
#   简体中文
# ? Set serve port 10000~65535: 17521
# ? Set service TOKEN (Use the wildcard character (*) to match any character): hiprint*
# ? Use SSL: (y/N)
# Configuration file written successfully
```

If your configuration is incorrect, you only need to execute the script again.

## Configuration

The configuration wizard will prompt you to set the following options:

- **Language**: Choose your preferred language (default: English).

- **Port**: The port number used for communication (default: 17521).

- **Token**: A secure token used for authentication (6 or more characters, can use one or more * as a wildcard) (default: hiiprint).

- **SSL**: Enable or disable SSL for secure connections (default: false).

<p align="right"><a href="#readme-top">↑ Back to top</a></p>

## Usage

### Start the Server

```bash
node ./dist/index

Server is running at
https://printjs.cn:17521

Make sure the port is open in your firewall or security group.
Token: hiprint*
```

### Connect `Web` Project to `node-hiprint-transit`

Now you can directly connect to the transit server `node-hiprint-transit` using the server address and token.

```javascript
import { hiprint } from 'vue-plugin-hiprint'

hiprint.init({
  host: 'https://printjs.cn:17521', // Enter the address after the server starts
  token: 'hiprint-1', // Token used for authentication
});
```

<p align="right"><a href="#readme-top">↑ Back to top</a></p>

### Connect `electron-hiprint` to `node-hiprint-transit`

Right-click on the tray icon to access the settings and enter the server address, port, and token.

![electron-hiprint set page](./res/electron-hiprint_set.png)

After entering the information, you can click on `Test` to check if the connection is successful.

> Connection Successful

![connect success](./res/connect_success.png)

> Connection Failed

![connect error](./res/connect_error.png)

Finally, restart the `electron-hiprint` application.

![electron-hiprint](./res/electron-hiprint.png)

<p align="right"><a href="#readme-top">↑ Back to top</a></p>

## EVENTS


When the Web client (`vue-plugin-hiprint`) connects, `serverInfo`, `clients`, and `printerList` events are emitted.

### socket.emit("serverInfo", Object) ↑ v0.0.4

This will return some information about the transit server.

```js
{
  // Transit server version
  version: "0.0.4",
  // Number of clients currently connected with the TOKEN
  currentClients: 1,
  // Total number of connected clients
  allClients: 1
  // Number of web clients currently connected with the TOKEN
  webClients: 1,
  // Total number of connected web clients
  allWebClients: 1,
  // Total server memory
  totalmem: 2147483648,
  // Free server memory
  freemem: 1073741824,
}
```


### socket.on("getClients")
### socket.emit("clients", Object)

This will display information about all connected `electron-hiprint` clients.

```js
{
  "AlBaUCNs3AIMFPLZAAAh": {
  arch: "x64",
  clientUrl: "http://192.168.0.2:17521",
  ip: "192.168.0.2",
  ipv6: "fe80::13f:eb0f:e426:7c92",
  mac: "a1:a2:a3:a4:a5:a6",
  machineId: "12c90ff9-b9f4-4178-9099-9dd326b70c2e",
  platform: "win32",
  printerList: (6) [{
    description: "",
    displayName: "Microsoft Print to PDF",
    isDefault: true,
    name: "Microsoft Print to PDF",
    options: {,
      "printer-location": "",
      "printer-make-and-model": "Microsoft Print To PDF",
      "system_driverinfo": "Microsoft Print To PDF;10.0.19041.3570 (WinBuild.160101.0800);Microsoft® Windows® Operating System;10.0.19041.3570"
    },
    status: 0
  }, {…}, {…}, {…}, {…}, {…}],
  version: "1.0.7",
  },
  "clientid": {…},
  ...
}
```

### socket.on("refreshPrinterList")
### socket.emit("printerList", Array)

<p align="right"><a href="#readme-top">↑ Back to top</a></p>

This will display information about all connected `electron-hiprint` client printers.

```js
[{
  clientId: "AlBaUCNs3AIMFPLZAAAh",
  description: "",
  displayName: "Microsoft Print to PDF",
  isDefault: true,
  name: "Microsoft Print to PDF",
  options: {,
  "printer-location": "",
  "printer-make-and-model": "Microsoft Print To PDF",
  "system_driverinfo": "Microsoft Print To PDF;10.0.19041.3570 (WinBuild.160101.0800);Microsoft® Windows® Operating System;10.0.19041.3570"
  },
  status: 0
}, {…}, {…}, {…}, {…}, {…}]
```

### socket.on("clientInfo", (Object) => {})

Information about `electron-hiprint`.

### socket.on("printerList", (Array) => {})

Send client printer information to `electron-hiprint`.

<p align="right"><a href="#readme-top">↑ Back to top</a></p>

### socket.on("address")

This API is not supported. Use `getClients` instead.

### socket.on("ippPrint", (options) => {})

Perform IPP printing on `electron-hiprint` client.

  - socket.emit("error", { msg })

  - socket.to(options.client).emit("ippPrint", { ...options, replyId: socket.id })

### socket.on("ippPrinterConnected", (options) => {})

Create IPP printer connection event to respond to the client.

  - socket.to(options.replyId).emit("ippPrinterConnected", options.printer)

<p align="right"><a href="#readme-top">↑ Back to top</a></p>

### socket.on("ippPrinterCallback", (options, res) => {})

Perform IPP printer callback to respond to the client.

  - socket.to(options.replyId).emit("ippPrinterCallback", options, res)

### socket.on("ippRequest", (options) => {})

Send IPP request to `electron-hiprint` client.

  - socket.emit("error", msg)

  - socket.to(options.client).emit("ippRequest", { ...options, replyId: socket.id })

<p align="right"><a href="#readme-top">↑ Back to top</a></p>

### socket.on("ippRequestCallback", (options, res) => {})

Perform IPP request callback to respond to the client.

  - socket.to(options.replyId).emit("ippRequestCallback", options, res)

### socket.on("news", (options) => {})

Send print information to `electron-hiprint` client.

  - socket.emit("error", {msg, templateId: options.templateId })

  - socket.to(options.client).emit("news", { ...options, replyId: socket.id })

<p align="right"><a href="#readme-top">↑ Back to top</a></p>

### socket.on("success", (options) => {})

Perform success callback to respond to the client.

  - socket.to(options.replyId).emit("success", options)

### socket.on("error", (options) => {})

Perform error callback to respond to the client.

  - socket.to(options.replyId).emit("error", options)

<p align="right"><a href="#readme-top">↑ Back to top</a></p>

## Some Unimportant Information

1. `node-hiprint-transit` will log information in the `./logs` directory.

2. If you enable SSL, you should replace the `./src/ssl.key` and `./src/ssl.pem` files.

3. The transit server will actively request the printer list from `electron-hiprint` every 10 minutes to update printer information.

4. https://printjs.cn:17521 is a demo address for version 0.0.3, which can be used to quickly verify the feasibility of the solution. The server is a 1C1G3M Hong Kong server and does not guarantee stable and reliable service. Please deploy it yourself if needed.

5. Why choose Node development? Because I am a frontend developer and can only choose Node development. `vue-plugin-hiprint` is a frontend plugin and most users are frontend developers. Why use a sledgehammer to crack a nut? Node can easily achieve the desired result!

<p align="right"><a href="#readme-top">↑ Back to top</a></p>

### If this project is helpful to you, please give it a star. Thank you!

<a href="https://www.buymeacoffee.com/xavier9896" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/arial-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" ></a>