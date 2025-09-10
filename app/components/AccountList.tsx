import { FlatList } from 'react-native';
import AccountListItem from './AccountListItem';

export default function AccountList({
  accounts
} : {
  accounts: { key: string; data: { name: string; value: string } | null }[]
}) {
  return (
    <FlatList
      data={accounts}
      renderItem={({ item }) => <AccountListItem account={item} />}
      keyExtractor={(item) => item.key}
    />
  );
}
