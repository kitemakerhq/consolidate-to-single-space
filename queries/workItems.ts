import gql from "graphql-tag";

export const workItemsQuery = gql`
  query WorkItems($space: ID!, $cursor: String) {
    workItems(spaceId: $space, cursor: $cursor, count: 50) {
      workItems {
        id
        labels {
          id
          name
          color
        }
        status {
          id
          name
          type
          default
        }
      }
      cursor
      hasMore
    }
  }
`;
