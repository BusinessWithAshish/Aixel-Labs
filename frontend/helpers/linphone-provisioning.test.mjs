// node --test helpers/linphone-provisioning.test.mjs  (Node 22.18+ strips the .ts types itself)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { linphoneProvisioningXml } from './linphone-provisioning.ts';

const xml = linphoneProvisioningXml({ userName: 'aixel0123abcd', password: 'p<w>&"x', displayName: 'Aixel "Labs" test' });
const entry = (section, key) =>
    new RegExp(`<section name="${section}">[\\s\\S]*?<entry name="${key}" overwrite="true">([^<]*)</entry>`).exec(xml)?.[1];

test('an lpconfig document, every entry overwriting', () => {
    assert.match(
        xml,
        /^<\?xml version="1.0" encoding="UTF-8"\?>\n<config xmlns="http:\/\/www.linphone.org\/xsds\/lpconfig.xsd">/,
    );
    assert.match(xml, /<\/config>\n$/);
    assert.equal(xml.match(/<entry /g).length, xml.match(/overwrite="true"/g).length);
});

test('the Telnyx account over TLS, through the outbound proxy, as the default account', () => {
    assert.equal(entry('sip', 'default_proxy'), '0');
    assert.equal(entry('proxy_0', 'reg_proxy'), '&lt;sip:sip.telnyx.com;transport=tls&gt;');
    assert.equal(entry('proxy_0', 'reg_route'), '&lt;sip:sip.telnyx.com;transport=tls&gt;');
    assert.equal(entry('proxy_0', 'reg_identity'), '&quot;Aixel Labs test&quot; &lt;sip:aixel0123abcd@sip.telnyx.com&gt;');
    assert.equal(entry('auth_info_0', 'username'), 'aixel0123abcd');
    assert.equal(entry('auth_info_0', 'domain'), 'sip.telnyx.com');
});

test('the password is escaped, not able to break the XML', () => {
    assert.equal(entry('auth_info_0', 'passwd'), 'p&lt;w&gt;&amp;&quot;x');
});

test('IPv6, video and media encryption off; applied once', () => {
    assert.equal(entry('sip', 'use_ipv6'), '0');
    assert.equal(entry('sip', 'media_encryption'), 'none');
    for (const key of ['capture', 'display', 'automatically_initiate', 'automatically_accept'])
        assert.equal(entry('video', key), '0');
    assert.equal(entry('misc', 'transient_provisioning'), '1');
});
