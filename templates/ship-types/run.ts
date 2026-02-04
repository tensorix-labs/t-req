#!/usr/bin/env bun
import { client } from './client';
import { User } from './schemas';

const response = await client.run('./collection/users/get.http');

// Validated + typed
const user = User.parse(await response.json());

console.log(`User: ${user.name} (${user.email})`);
console.log(`Company: ${user.company.name}`);
