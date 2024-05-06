import { Type } from '@sinclair/typebox';
import { FastifyReply } from 'fastify';
import { send, sendSuccess } from '#fastify/index';
import { User } from '#model/user';
import { logger } from '#o11y/logger';
import { AppFastifyInstance } from '../../app';

const basePath = '/profile';
export async function profileRoute(fastify: AppFastifyInstance) {
	fastify.get(`${basePath}/view`, async (req, reply) => {
		const user: User = await fastify.userService.getCurrentUser();

		send(reply, 200, user);
	});

	fastify.post(
		`${basePath}/update`,
		{
			schema: {
				body: Type.Object({
					user: Type.Object({
						email: Type.String(),
					}),
				}),
			},
		},
		async (req, reply) => {
			const user = req.body.user;
			await fastify.userService.updateUser(user);
			send(reply as FastifyReply, 200);
		},
	);
}
