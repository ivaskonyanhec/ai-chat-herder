import type { ApiHelpers } from './api.helpers';

export async function becomeFriends(
  api: ApiHelpers,
  senderToken: string,
  receiverToken: string,
  receiverUsername: string,
  senderId: string,
): Promise<void> {
  await api.sendFriendRequest(senderToken, receiverUsername, 'E2E setup');
  const requests = await api.getFriendRequests(receiverToken);
  const request = requests.find(r => r.senderId === senderId);
  if (!request?.id) throw new Error('Friend request not found');
  await api.acceptFriendRequest(receiverToken, request.id);
}
