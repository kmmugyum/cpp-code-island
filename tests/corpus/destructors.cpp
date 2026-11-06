#include <iostream>
using namespace std;
class Robot {
public:
  int id;
  Robot(int n) { id = n; }
  ~Robot() { cout << id << ' '; }
};
int main() {
  {
    Robot a(1);
    Robot b(2);
  }
  cout << 3 << '\n';
}
