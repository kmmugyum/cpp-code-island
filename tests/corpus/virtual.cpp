#include <iostream>
class Robot {
public:
  virtual int work() { return 1; }
};
class RepairRobot : public Robot {
public:
  int work() override { return 7; }
};
int main() {
  RepairRobot a;
  Robot* p = &a;
  std::cout << p->work() << ' ' << (*p).work() << '\n';
}
