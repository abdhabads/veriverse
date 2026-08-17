export function updatePostInList(posts: any[], postId: string, updater: (post: any) => any) {
  return posts.map((post) => (String(post._id) === String(postId) ? updater(post) : post));
}

export function removePostsByAuthor(posts: any[], authorId: string) {
  return posts.filter((post) => String(post.author?._id) !== String(authorId));
}

export function prependPost(posts: any[], newPost: any) {
  return [newPost, ...posts];
}
