#include <iostream>
#include <string>
#include <set>
#include <algorithm>
#include <fstream>
#include <stdexcept>
using namespace std;

template <typename T>
T biggest(T a, T b) { return a > b ? a : b; }

template <typename T>
class Box {
public:
  T value;
  Box(T v) : value(v) {}
  T get() const { return value; }
};

struct Bundle {
  int parts;
  Bundle(int p) : parts(p) {}
  Bundle operator+(const Bundle& o) const { return Bundle(parts + o.parts); }
};
ostream& operator<<(ostream& os, const Bundle& b) { return os << "B" << b.parts; }

void risky(int n) {
  if (n > 2) throw runtime_error("too big");
}

int main() {
  cout << biggest(3, 7) << ' ' << biggest<double>(2, 1.5) << '\n';
  Box<int> box(42);
  cout << box.get() << '\n';
  set<int> s;
  s.insert(5); s.insert(1); s.insert(5); s.insert(3);
  for (int x : s) cout << x << ' ';
  cout << s.size() << '\n';
  int arr[4] = {9, 2, 7, 4};
  sort(arr, arr + 4);
  cout << arr[0] << arr[3] << binary_search(arr, arr + 4, 7) << '\n';
  Bundle total = Bundle(2) + Bundle(5);
  cout << total << '\n';
  string name = "robot";
  name += "-7";
  cout << name << ' ' << name.size() << ' ' << name.substr(0, 3) << ' ' << name.find("-") << '\n';
  {
    ofstream out("log.txt");
    out << "line1\nline2\n";
  }
  ifstream in("log.txt");
  string line;
  int count = 0;
  while (getline(in, line)) count++;
  cout << count << '\n';
  try {
    risky(5);
  } catch (const exception& e) {
    cout << e.what() << '\n';
  }
  risky(9);
}
